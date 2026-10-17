// Servidor mínimo para que Make dispare a Judy:
//   GET  /health                 → estado
//   POST /run   (x-judy-key)     → lanza una recopilación en segundo plano y responde 202 con su id
//   GET  /runs/:id (x-judy-key)  → estado y resumen de una ejecución
// Al terminar, si MAKE_CALLBACK_URL está definido, Judy envía el resumen a ese webhook de Make.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createHttpClient } from "./util/http.ts";
import { collect } from "./pipeline.ts";
import { parseSources } from "./cli.ts";
import { saveToSupabase, supabaseConfigFromEnv } from "./store/supabase.ts";

type RunState = { id: string; status: "running" | "succeeded" | "failed"; started_at: string; summary?: unknown; error?: string };
const runs = new Map<string, RunState>();
let busy = false;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function keyMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error("Cuerpo demasiado grande");
  }
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("El cuerpo debe ser un objeto JSON");
  return parsed as Record<string, unknown>;
}

async function execute(state: RunState, body: Record<string, unknown>) {
  try {
    const sources = parseSources(typeof body.sources === "string" ? body.sources : Array.isArray(body.sources) ? body.sources.join(",") : undefined);
    const http = createHttpClient({ userAgent: process.env.JUDY_USER_AGENT, robotsExempt: ["www.infosubvenciones.es", "api.tech.ec.europa.eu"] });
    const report = await collect(
      http,
      {
        now: new Date(),
        sinceDays: Math.min(365, Math.max(1, Number(body.sinceDays) || 120)),
        maxPerSource: Math.min(1000, Math.max(1, Number(body.maxPerSource) || 600)),
      },
      sources,
      { anthropicApiKey: process.env.ANTHROPIC_API_KEY, llmModel: process.env.JUDY_LLM_MODEL, firecrawlApiKey: process.env.FIRECRAWL_API_KEY, firecrawlUrl: process.env.FIRECRAWL_API_URL, firecrawlMaxAgeMs: process.env.FIRECRAWL_MAX_AGE_MS ? Number(process.env.FIRECRAWL_MAX_AGE_MS) : undefined },
    );
    const supabase = supabaseConfigFromEnv();
    const stored = supabase ? await saveToSupabase(supabase, report, "make") : null;
    state.summary = {
      stats: report.stats,
      total: report.items.length,
      stored,
      errors: report.errors,
      open_now: report.items.filter((i) => i.status === "open").slice(0, 20)
        .map((i) => ({ title: i.title, funder: i.funder_name, deadline_at: i.deadline_at, url: i.url, source: i.source })),
    };
    state.status = "succeeded";
  } catch (error) {
    state.status = "failed";
    state.error = String(error).slice(0, 500);
  } finally {
    busy = false;
  }
  const callback = process.env.MAKE_CALLBACK_URL;
  if (callback) {
    await fetch(callback, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state), signal: AbortSignal.timeout(30_000) })
      .catch((error) => console.warn("No se pudo avisar a Make:", String(error)));
  }
}

export function createJudyServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, agent: "Judy", busy });
    if (!keyMatches(req.headers["x-judy-key"] as string | undefined, process.env.JUDY_API_KEY)) return send(res, 401, { error: "No autorizado" });

    const runMatch = url.pathname.match(/^\/runs\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && runMatch) {
      const state = runs.get(runMatch[1]);
      return state ? send(res, 200, state) : send(res, 404, { error: "Ejecución no encontrada" });
    }
    if (req.method === "POST" && url.pathname === "/run") {
      if (busy) return send(res, 409, { error: "Ya hay una recopilación en curso" });
      let body: Record<string, unknown>;
      try {
        body = await readJson(req);
      } catch (error) {
        return send(res, 400, { error: String(error) });
      }
      busy = true;
      const state: RunState = { id: randomUUID(), status: "running", started_at: new Date().toISOString() };
      runs.set(state.id, state);
      void execute(state, body);
      return send(res, 202, { run_id: state.id, status: state.status });
    }
    return send(res, 404, { error: "Ruta no encontrada" });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.JUDY_API_KEY || process.env.JUDY_API_KEY.length < 24) {
    console.error("Define JUDY_API_KEY (mínimo 24 caracteres) antes de arrancar el servidor.");
    process.exit(1);
  }
  const port = Number(process.env.PORT) || 8787;
  createJudyServer().listen(port, () => console.log(`Judy escuchando en :${port}`));
}
