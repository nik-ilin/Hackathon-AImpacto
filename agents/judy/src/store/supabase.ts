// Server-only adapter to the canonical opportunities/funding_details catalog.
import type { CollectReport, StoredOpportunity } from "../pipeline.ts";

export type SupabaseConfig = { url: string; serviceKey: string; fetch?: (input: string, init?: RequestInit) => Promise<Response> };
export type RunStatus = "running" | "completed" | "partial" | "failed";
export type RunState = { run_id: string; status: RunStatus; claimed?: boolean; reused?: boolean; lease_token?: string; created?: number; updated?: number; unchanged?: number };
export type RunParameters = { sources: string[]; sinceDays: number; maxPerSource: number };
export type Trigger = "cli" | "make" | "schedule";
export class PersistenceConfigurationError extends Error {}

export class StoreError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, code?: string) {
    super(code === "55P03" ? "JUDY_BUSY" : `Supabase RPC: HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

export async function rpc<T>(config: SupabaseConfig, name: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { apikey: config.serviceKey, "content-type": "application/json" };
  if (config.serviceKey.split(".").length === 3) headers.authorization = `Bearer ${config.serviceKey}`;
  const response = await (config.fetch ?? fetch)(`${config.url.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { code?: string };
    throw new StoreError(response.status, error.code);
  }
  return await response.json() as T;
}

export const beginRun = (config: SupabaseConfig, requestId: string, trigger: Trigger, parameters: RunParameters) =>
  rpc<RunState>(config, "judy_begin_run", { p_request_id: requestId, p_trigger: trigger, p_parameters: parameters });
export const getRun = (config: SupabaseConfig, requestId: string) => rpc<RunState | null>(config, "judy_get_run", { p_request_id: requestId });
export const renewRun = (config: SupabaseConfig, state: RunState) => rpc(config, "judy_renew_run", { p_run_id: state.run_id, p_lease_token: state.lease_token });
export const finishRun = (config: SupabaseConfig, state: RunState, report: Omit<CollectReport, "items">) =>
  rpc<RunState>(config, "judy_finish_run", { p_run_id: state.run_id, p_lease_token: state.lease_token, p_report: report });

export async function saveToSupabase(config: SupabaseConfig, report: CollectReport, state: RunState) {
  for (let offset = 0; offset < report.items.length; offset += 200) {
    const items: StoredOpportunity[] = report.items.slice(offset, offset + 200);
    for (const item of items) {
      for (const value of [item.url, item.source_url, item.bases_url].filter(Boolean)) {
        const url = new URL(value!);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("Judy requires HTTPS source URLs without credentials");
      }
    }
    const body = { p_run_id: state.run_id, p_lease_token: state.lease_token, p_batch_key: `batch-${String(offset / 200).padStart(4, "0")}`, p_items: items };
    // Lost responses may have committed: immutable batch keys make retries safe.
    try { await rpc(config, "judy_upsert_opportunities", body); }
    catch (error) {
      if (error instanceof StoreError && error.status < 500) throw error;
      await rpc(config, "judy_upsert_opportunities", body);
    }
  }
  const metadata = { started_at: report.started_at, finished_at: report.finished_at, stats: report.stats, errors: report.errors, skipped: report.skipped };
  try { return await finishRun(config, state, metadata); }
  catch (error) {
    if (error instanceof StoreError && error.status < 500) throw error;
    return finishRun(config, state, metadata);
  }
}

export function supabaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseConfig {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) throw new PersistenceConfigurationError("Persistence required: configure SUPABASE_URL and a server-only Supabase service key, or use --dry-run.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new PersistenceConfigurationError("SUPABASE_URL is invalid."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) || parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new PersistenceConfigurationError("SUPABASE_URL must use HTTPS (HTTP only for localhost).");
  return { url: parsed.toString().replace(/\/+$/, ""), serviceKey };
}
