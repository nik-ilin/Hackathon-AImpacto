// Orquestación: ejecuta las fuentes, deduplica, calcula el hash de contenido y devuelve un informe.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HttpClient } from "./util/http.ts";
import type { CollectOptions, FundingOpportunity, SourceId, SourceResult } from "./types.ts";
import { contentHash } from "./util/text.ts";
import { collectBdns } from "./sources/bdns.ts";
import { collectEuFundingTenders } from "./sources/euFundingTenders.ts";
import { collectUcmOtri } from "./sources/ucmOtri.ts";
import { collectPrivateWeb, type PrivatePage, type PrivateWebEnv } from "./sources/privateWeb.ts";

export const ALL_SOURCES: SourceId[] = ["bdns", "eu_funding_tenders", "ucm_otri", "private_web"];

export type StoredOpportunity = FundingOpportunity & { content_hash: string };

export type CollectReport = {
  started_at: string;
  finished_at: string;
  items: StoredOpportunity[];
  stats: Record<string, { collected: number; skipped: number; errors: number; open: number; forthcoming: number }>;
  errors: string[];
  skipped: { source: SourceId; id: string; reason: string }[];
};

export function loadPrivatePages(): PrivatePage[] {
  const path = fileURLToPath(new URL("../config/private-sources.json", import.meta.url));
  return (JSON.parse(readFileSync(path, "utf8")) as { pages: PrivatePage[] }).pages;
}

/** El hash ignora el estado (cambia solo con la fecha) y los datos crudos de auditoría. */
export function hashOpportunity(item: FundingOpportunity): string {
  const content = Object.fromEntries(Object.entries(item).filter(([key]) => key !== "status" && key !== "raw"));
  return contentHash(content);
}

export async function collect(
  http: HttpClient,
  options: CollectOptions,
  sources: SourceId[] = ALL_SOURCES,
  env: PrivateWebEnv & { privatePages?: PrivatePage[] } = {},
): Promise<CollectReport> {
  const started = new Date();
  const results: SourceResult[] = [];
  for (const source of sources) {
    switch (source) {
      case "bdns":
        results.push(await collectBdns(http, options));
        break;
      case "eu_funding_tenders":
        results.push(await collectEuFundingTenders(http, options));
        break;
      case "ucm_otri":
        results.push(await collectUcmOtri(http, options));
        break;
      case "private_web":
        results.push(await collectPrivateWeb(http, options, env.privatePages ?? loadPrivatePages(), env));
        break;
    }
  }

  const byKey = new Map<string, StoredOpportunity>();
  const report: CollectReport = { started_at: started.toISOString(), finished_at: "", items: [], stats: {}, errors: [], skipped: [] };
  for (const result of results) {
    for (const item of result.items) byKey.set(`${item.source}:${item.external_id}`, { ...item, content_hash: hashOpportunity(item) });
    report.errors.push(...result.errors.map((e) => `[${result.source}] ${e}`));
    report.skipped.push(...result.skipped.map((s) => ({ source: result.source, ...s })));
    report.stats[result.source] = {
      collected: result.items.length,
      skipped: result.skipped.length,
      errors: result.errors.length,
      open: result.items.filter((i) => i.status === "open").length,
      forthcoming: result.items.filter((i) => i.status === "forthcoming").length,
    };
  }
  report.items = [...byKey.values()].sort((a, b) => (a.deadline_at ?? "9999").localeCompare(b.deadline_at ?? "9999"));
  report.finished_at = new Date().toISOString();
  return report;
}

const CSV_COLUMNS: (keyof StoredOpportunity)[] = [
  "source", "external_id", "status", "funder_type", "funder_name", "title", "deadline_at", "deadline_text",
  "internal_deadline_at", "opens_at", "currency", "min_amount", "max_amount", "total_budget", "scope", "programme",
  "instrument", "eligible_beneficiaries", "url", "bases_url", "source_url",
];

export function toCsv(items: StoredOpportunity[]): string {
  const cell = (value: unknown) => {
    const text = Array.isArray(value) ? value.join("; ") : value == null ? "" : String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [CSV_COLUMNS.join(","), ...items.map((item) => CSV_COLUMNS.map((c) => cell(item[c])).join(","))].join("\n");
}
