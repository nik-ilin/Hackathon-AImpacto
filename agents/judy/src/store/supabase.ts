// Persistencia en Supabase vía PostgREST, con la clave de servicio (solo en servidor, nunca en el navegador).
import type { CollectReport, StoredOpportunity } from "../pipeline.ts";

export type SupabaseConfig = { url: string; serviceKey: string; fetch?: (input: string, init?: RequestInit) => Promise<Response> };

function headers(config: SupabaseConfig): Record<string, string> {
  const base: Record<string, string> = { apikey: config.serviceKey, "content-type": "application/json" };
  // Las claves heredadas (JWT) van también en Authorization; las nuevas sb_secret_ solo en apikey.
  if (config.serviceKey.split(".").length === 3) base.authorization = `Bearer ${config.serviceKey}`;
  return base;
}

async function rpc<T>(config: SupabaseConfig, name: string, body: unknown): Promise<T> {
  const doFetch = config.fetch ?? fetch;
  const response = await doFetch(`${config.url.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Supabase ${name}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  return (await response.json()) as T;
}

export async function saveToSupabase(config: SupabaseConfig, report: CollectReport, trigger: "cli" | "make" | "schedule") {
  const totals = { created: 0, updated: 0, unchanged: 0 };
  const batches: StoredOpportunity[][] = [];
  for (let i = 0; i < report.items.length; i += 200) batches.push(report.items.slice(i, i + 200));
  for (const batch of batches) {
    const counts = await rpc<typeof totals>(config, "judy_upsert_opportunities", { p_items: batch });
    totals.created += counts.created;
    totals.updated += counts.updated;
    totals.unchanged += counts.unchanged;
  }
  const runId = await rpc<string>(config, "judy_record_run", {
    p_run: { trigger, started_at: report.started_at, finished_at: report.finished_at, stats: { ...report.stats, stored: totals }, errors: report.errors },
  });
  return { runId, ...totals };
}

export function supabaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseConfig | null {
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  if (!/^https?:\/\//.test(url)) throw new Error("SUPABASE_URL no es una URL válida.");
  return { url, serviceKey };
}
