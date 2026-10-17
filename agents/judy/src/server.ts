// Optional trusted-host server. Recommended operation is Actions cron/workflow_dispatch + polling.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parameters, requestId, runCollection, type RunnerDependencies } from "./runner.ts";
import { beginRun, getRun, StoreError, supabaseConfigFromEnv, type RunState } from "./store/supabase.ts";

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
export function keyMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 10_000) throw new Error("Body too large");
    chunks.push(bytes);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected JSON object");
  return parsed as Record<string, unknown>;
}
const publicState = (state: RunState) => {
  return Object.fromEntries(Object.entries(state).filter(([key]) => key !== "lease_token"));
};
const statusCode = (state: RunState) => state.status === "running" ? 202 : state.status === "partial" ? 207 : state.status === "failed" ? 500 : 200;

export function createJudyServer(dependencies: RunnerDependencies = {}) {
  const env = dependencies.env ?? process.env;
  if (!env.JUDY_API_KEY || env.JUDY_API_KEY.length < 24) throw new Error("JUDY_API_KEY must have at least 24 characters");
  if (env.MAKE_CALLBACK_URL) throw new Error("Unsigned callbacks are disabled. Poll run status instead.");
  const config = dependencies.config ?? supabaseConfigFromEnv(env);
  return createServer(async (req, res) => {
    try {
      const key = req.headers["x-judy-key"];
      if (!keyMatches(typeof key === "string" ? key : undefined, env.JUDY_API_KEY)) return send(res, 401, { error: "Unauthorized" });
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, agent: "Judy" });
      const match = url.pathname.match(/^\/runs\/([a-zA-Z0-9_.:-]{1,128})$/);
      if (req.method === "GET" && match) {
        let id: string;
        try { id = requestId(match[1]); } catch { return send(res, 400, { error: "Invalid request_id" }); }
        const state = await getRun(config, id);
        return state ? send(res, statusCode(state), publicState(state)) : send(res, 404, { error: "Run not found" });
      }
      if (req.method === "POST" && url.pathname === "/run") {
        let body: Record<string, unknown>;
        let params;
        let id;
        try {
          body = await readJson(req);
          if (typeof body.request_id !== "string") throw new Error("request_id required");
          id = requestId(body.request_id);
          if (body.sources !== undefined && typeof body.sources !== "string") throw new Error("sources must be comma-separated string");
          params = parameters(body.sources as string | undefined, body.sinceDays, body.maxPerSource);
        } catch { return send(res, 400, { error: "Invalid request_id, sources or collection limits" }); }
        // Database claim is atomic across requests, processes, CLI and Actions.
        const state = await beginRun(config, id, "make", params);
        if (state.claimed) void runCollection({ requestId: id, trigger: "make", params }, { ...dependencies, config, claimedState: state })
          .catch(() => { console.error("Judy run failed; consult persisted status."); });
        return send(res, statusCode(state), { request_id: id, ...publicState(state) });
      }
      return send(res, 404, { error: "Route not found" });
    } catch (error) {
      if (error instanceof StoreError && error.code === "55P03") return send(res, 429, { error: "JUDY_BUSY", retry_after: 60 });
      if (error instanceof StoreError && error.status < 500) return send(res, 409, { error: "Run request conflict" });
      return send(res, 503, { error: "Persistence unavailable" });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { createJudyServer().listen(Number(process.env.PORT) || 8787, "127.0.0.1"); }
  catch { console.error("Judy server configuration invalid. Configure persistence/API key; callbacks are disabled."); process.exitCode = 1; }
}
