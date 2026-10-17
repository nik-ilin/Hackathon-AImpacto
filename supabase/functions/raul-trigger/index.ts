import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { extractOfficialPage, sourceSpecs } from "./catalog.ts";
import { tokensEqual } from "./security.ts";

const MAX_SOURCES = 5;
const MAX_FIRECRAWL_CREDITS = 3;
const SCRAPE_TIMEOUT_MS = 12_000;
const ALGORITHM_VERSION = "raul-1.0.0";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function contentHash(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content.replace(/\s+/g, " ").trim()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function scrape(url: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, proxy: "basic" }),
    signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`firecrawl_http_${response.status}`);
  const result = await response.json();
  if (result.success !== true || typeof result.data?.markdown !== "string") throw new Error("firecrawl_invalid_response");
  return result.data.markdown;
}

function requestKey(request: Request, body: { request_id?: unknown; mode: string; max_sources: number }): string {
  const explicit = request.headers.get("x-raul-request-id") ?? body.request_id;
  if (explicit !== undefined && explicit !== null) {
    if (typeof explicit !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(explicit)) throw new Error("invalid_request_id");
    return explicit;
  }
  // A scheduled execution is idempotent by UTC day unless Make supplies its own key.
  return `daily_${new Date().toISOString().slice(0, 10)}_${body.mode}_${body.max_sources}`;
}

Deno.serve(async (request) => {
  const triggerToken = Deno.env.get("RAUL_TRIGGER_TOKEN") ?? "";
  if (!(await tokensEqual(request.headers.get("x-raul-trigger-key"), triggerToken))) {
    return json({ error: "unauthorized" }, 401);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "backend_configuration_error" }, 500);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  if (request.method === "GET") {
    const runId = new URL(request.url).searchParams.get("run_id");
    if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) return json({ error: "invalid_run_id" }, 400);
    const { data, error } = await db.from("raul_runs").select("id,status,mode,max_sources,sources_reviewed,created_count,updated_count,unchanged_count,discarded_count,error_count,duration_ms,credits_estimated,credits_measured,started_at,finished_at,lease_until,error_codes").eq("id", runId).maybeSingle();
    if (error) return json({ error: "run_lookup_failed" }, 500);
    if (!data) return json({ error: "run_not_found" }, 404);
    const expired = data.status === "running" && new Date(data.lease_until).getTime() < Date.now();
    return json({ run_id: data.id, ...data, status: expired ? "failed" : data.status,
      error_codes: expired ? [...data.error_codes, "LEASE_EXPIRED"] : data.error_codes });
  }
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { mode: string; max_sources: number; request_id?: unknown };
  let key: string;
  try {
    body = await request.json();
    if (body?.mode !== "incremental" || !Number.isInteger(body?.max_sources) || body.max_sources < 1 || body.max_sources > MAX_SOURCES) throw new Error("invalid_body");
    key = requestKey(request, body);
  } catch {
    return json({ error: "invalid_body", expected: { mode: "incremental", max_sources: 5 } }, 400);
  }

  const { data: begun, error: beginError } = await db.rpc("raul_begin_run", {
    p_request_key: key,
    p_mode: body.mode,
    p_max_sources: body.max_sources,
  });
  if (beginError) {
    if (/RAUL_BUSY/.test(beginError.message)) return json({ error: "busy", retryable: true }, 429);
    return json({ error: "run_start_failed" }, 500);
  }
  const run = typeof begun === "string" ? JSON.parse(begun) : begun;
  if (!run || typeof run.run_id !== "string") return json({ error: "run_start_invalid" }, 500);
  if (run.reused) {
    const { data: prior, error: priorError } = await db.from("raul_runs")
      .select("status,sources_reviewed,created_count,updated_count,unchanged_count,discarded_count,error_count,duration_ms,credits_estimated,credits_measured,error_codes")
      .eq("id", run.run_id).single();
    if (priorError) return json({ run_id: run.run_id, error: "run_lookup_failed" }, 500);
    return json({ run_id: run.run_id, status: prior.status, summary: prior }, prior.status === "running" ? 202 : prior.status === "failed" ? 500 : 200);
  }

  let failures = 0;
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  const chosen = sourceSpecs.slice(0, Math.min(body.max_sources, MAX_FIRECRAWL_CREDITS));
  let registryErrors = 0;
  for (const spec of chosen) {
    // No dynamic URL is accepted from Make. The registry is an allowlist.
    const { data: registered, error: sourceError } = await db.from("opportunity_sources").select("id,status,official_url").eq("id", spec.id).maybeSingle();
    if (sourceError || !registered || registered.official_url !== spec.url) {
      registryErrors++;
      continue;
    }
    if (!["active", "pending_review"].includes(registered.status)) {
      const { error: skipError } = await db.rpc("raul_record_source_result", {
        p_run_id: run.run_id, p_source_id: spec.id, p_status: "skipped",
        p_created: 0, p_updated: 0, p_unchanged: 0, p_discarded: 1,
        p_error_code: "source_not_active", p_credits_estimated: 0,
        p_credits_measured: null, p_duration_ms: 0,
      });
      if (skipError) return json({ run_id: run.run_id, status: "running", error: "source_result_write_failed" }, 500);
      continue;
    }
    const sourceStart = Date.now();
    let credit = 0;
    try {
      if (!firecrawlKey) throw new Error("firecrawl_not_configured");
      credit = 1; // Basic proxy costs one credit per requested page.
      const markdown = await scrape(spec.url, firecrawlKey);
      const extracted = extractOfficialPage(spec, markdown, new Date());
      const payload = { ...extracted, provenance: {
        ...extracted.provenance,
        source_content_hash: await contentHash(markdown),
      } };
      if (payload.status === "closed") {
        const { error: closedError } = await db.rpc("raul_record_source_result", {
          p_run_id: run.run_id, p_source_id: spec.id, p_status: "skipped",
          p_created: 0, p_updated: 0, p_unchanged: 0, p_discarded: 1,
          p_error_code: "official_deadline_passed", p_credits_estimated: credit,
          p_credits_measured: null, p_duration_ms: Date.now() - sourceStart,
        });
        if (closedError) throw new Error("source_result_write_failed");
        continue;
      }
      const { data: action, error: upsertError } = await db.rpc("raul_upsert_opportunity", {
        p_run_id: run.run_id,
        p_source_id: spec.id,
        p_external_id: payload.external_id,
        p_data: payload,
        p_duration_ms: Date.now() - sourceStart,
        p_credits_estimated: credit,
        p_credits_measured: null,
      });
      if (upsertError) throw new Error("catalog_write_failed");
      if (!["created", "updated", "unchanged"].includes(action?.result)) throw new Error("catalog_write_invalid_result");
    } catch (error) {
      failures++;
      // Errors are codes only; never log tokens or source page contents.
      const code = error instanceof Error ? error.message : "unknown_error";
      const { error: recordError } = await db.rpc("raul_record_source_result", {
        p_run_id: run.run_id, p_source_id: spec.id, p_status: "failed",
        p_created: 0, p_updated: 0, p_unchanged: 0, p_discarded: 0,
        p_error_code: /^[a-z0-9_]+$/.test(code) ? code : "extraction_failed",
        p_credits_estimated: credit, p_credits_measured: null,
        p_duration_ms: Date.now() - sourceStart,
      });
      if (recordError) return json({ run_id: run.run_id, status: "running", error: "source_result_write_failed" }, 500);
      continue;
    }
  }
  const status = registryErrors ? "failed" : failures ? "partial" : "completed";
  const { data: summary, error: finishError } = await db.rpc("raul_finish_run", {
    p_run_id: run.run_id,
    p_status: status,
  });
  if (finishError) return json({ run_id: run.run_id, status: "running", error: "run_finalization_failed", status_url: `${new URL(request.url).origin}${new URL(request.url).pathname}?run_id=${run.run_id}` }, 500);
  return json({ run_id: run.run_id, status, summary, algorithm_version: ALGORITHM_VERSION,
    ...(registryErrors ? { error: "source_registry_mismatch" } : {}) }, registryErrors ? 500 : failures ? 207 : 200);
});
