import { randomUUID } from "node:crypto";
import { createHttpClient } from "./util/http.ts";
import { ALL_SOURCES, collect, type CollectReport } from "./pipeline.ts";
import { beginRun, finishRun, renewRun, saveToSupabase, supabaseConfigFromEnv, type RunParameters, type RunState, type SupabaseConfig, type Trigger } from "./store/supabase.ts";
import type { SourceId } from "./types.ts";

export function parseSources(value: string | undefined): SourceId[] {
  if (!value) return ALL_SOURCES.filter(source => source !== "private_web");
  const aliases: Record<string, SourceId> = { eu: "eu_funding_tenders", ucm: "ucm_otri", private: "private_web" };
  const list = [...new Set(value.split(",").map((s) => s.trim()).filter(Boolean).map((s) => aliases[s] ?? s))].sort();
  if (!list.length || list.some((s) => !(ALL_SOURCES as string[]).includes(s))) throw new Error("Invalid sources");
  return list as SourceId[];
}
export function parameters(sources?: string, sinceDays: unknown = 120, max: unknown = 600): RunParameters {
  const days = Number(sinceDays), limit = Number(max);
  if (!Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("sinceDays must be 1..365 and maxPerSource 1..1000 (integers)");
  return { sources: parseSources(sources).sort(), sinceDays: days, maxPerSource: limit };
}
export function requestId(value?: string): string {
  if (value === undefined) return randomUUID();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,127}$/.test(value)) throw new Error("Invalid request_id (8..128 safe characters)");
  return value;
}
export type RunnerDependencies = { config?: SupabaseConfig; env?: NodeJS.ProcessEnv; collectReport?: (params: RunParameters) => Promise<CollectReport>; heartbeatMs?: number; claimedState?: RunState };
export type RunResult = { state: RunState | { status: "dry_run" }; report?: CollectReport };

export async function runCollection(input: { requestId: string; trigger: Trigger; params: RunParameters; dryRun?: boolean }, dependencies: RunnerDependencies = {}): Promise<RunResult> {
  const env = dependencies.env ?? process.env;
  // Preflight before creating HTTP clients, calling paid providers, or collecting anything.
  const config = input.dryRun ? undefined : dependencies.config ?? supabaseConfigFromEnv(env);
  const state = config ? dependencies.claimedState ?? await beginRun(config, input.requestId, input.trigger, input.params) : undefined;
  if (state && !state.claimed) return { state };
  let leaseError = false;
  const heartbeat = config && state ? setInterval(() => {
    void renewRun(config, state).catch(() => { leaseError = true; });
  }, dependencies.heartbeatMs ?? 60_000) : undefined;
  heartbeat?.unref();
  let report: CollectReport | undefined;
  try {
    const load = dependencies.collectReport ?? (async (params: RunParameters) => {
      const http = createHttpClient({ userAgent: env.JUDY_USER_AGENT, robotsExempt: ["www.infosubvenciones.es", "api.tech.ec.europa.eu"] });
      return collect(http, { now: new Date(), sinceDays: params.sinceDays, maxPerSource: params.maxPerSource }, params.sources as SourceId[], {
        anthropicApiKey: env.ANTHROPIC_API_KEY, llmModel: env.JUDY_LLM_MODEL,
        firecrawlApiKey: env.FIRECRAWL_API_KEY, firecrawlUrl: env.FIRECRAWL_API_URL,
        firecrawlMaxAgeMs: env.FIRECRAWL_MAX_AGE_MS ? Number(env.FIRECRAWL_MAX_AGE_MS) : undefined,
      });
    });
    report = await load(input.params);
    if (leaseError) throw new Error("Run lease could not be renewed");
    if (!config || !state) return { state: { status: "dry_run" }, report };
    // Verify lease after long source calls, before writing any catalog data.
    await renewRun(config, state);
    return { state: await saveToSupabase(config, report, state), report };
  } catch (error) {
    if (config && state) {
      const now = new Date().toISOString();
      const failedStats = Object.fromEntries(Object.entries(report?.stats ?? {}).map(([source, stats]) => [source, { ...stats, errors: stats.errors + 1 }]));
      const failure = { started_at: report?.started_at ?? now, finished_at: now, stats: failedStats, skipped: report?.skipped ?? [], errors: [...(report?.errors ?? []), "Collection or persistence failed; inspect server-side run diagnostics."] };
      try { await finishRun(config, state, failure); } catch { /* Expired leases are fenced by SQL. */ }
    }
    throw error;
  } finally { if (heartbeat) clearInterval(heartbeat); }
}
