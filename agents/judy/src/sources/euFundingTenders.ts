// Fuente pública europea: Funding & Tenders Portal (Search API de la Comisión Europea, clave pública "SEDIA").
// Se piden "topics" (type 1) abiertos o próximos de los programas configurados (por defecto, Horizon Europe).
import type { HttpClient } from "../util/http.ts";
import type { CollectOptions, FundingOpportunity, SourceResult } from "../types.ts";
import { computeStatus, parseDate, stripHtml, truncate } from "../util/text.ts";

export const EU_SEARCH_API = "https://api.tech.ec.europa.eu/search-api/prod/rest/search";
export const EU_STATUS = { forthcoming: "31094501", open: "31094502" } as const;
/** Identificadores CCM2 de programa usados por el portal. */
export const EU_PROGRAMMES: Record<string, string> = { "43108390": "Horizon Europe" };

type Meta = Record<string, string[] | undefined>;
export type EuResult = { reference: string; url: string; summary: string; metadata: Meta };
type EuResponse = { totalResults: number; results: EuResult[] };

export type EuOptions = { programmes?: string[]; pageSize?: number };

export async function collectEuFundingTenders(http: HttpClient, options: CollectOptions, eu: EuOptions = {}): Promise<SourceResult> {
  const result: SourceResult = { source: "eu_funding_tenders", items: [], skipped: [], errors: [] };
  const programmes = eu.programmes ?? Object.keys(EU_PROGRAMMES);
  const pageSize = Math.min(eu.pageSize ?? 100, 100);
  const query = {
    bool: {
      must: [
        { terms: { type: ["1"] } },
        { terms: { status: [EU_STATUS.forthcoming, EU_STATUS.open] } },
        { terms: { frameworkProgramme: programmes } },
      ],
    },
  };
  const seen = new Set<string>();
  for (let page = 1; result.items.length + result.skipped.length < options.maxPerSource; page++) {
    const form = new FormData();
    form.append("query", new Blob([JSON.stringify(query)], { type: "application/json" }));
    form.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }));
    form.append("sort", new Blob([JSON.stringify({ field: "sortStatus", order: "ASC" })], { type: "application/json" }));
    let data: EuResponse;
    try {
      data = await http.postForm<EuResponse>(`${EU_SEARCH_API}?apiKey=SEDIA&text=***&pageSize=${pageSize}&pageNumber=${page}`, form);
    } catch (error) {
      result.errors.push(`Búsqueda UE página ${page}: ${String(error)}`);
      break;
    }
    for (const item of data.results) {
      const mapped = mapEuTopic(item, options.now);
      if ("skip" in mapped) {
        result.skipped.push({ id: item.reference, reason: mapped.skip });
        continue;
      }
      if (seen.has(mapped.external_id)) continue; // el portal repite un topic por idioma o versión
      seen.add(mapped.external_id);
      result.items.push(mapped);
      if (result.items.length >= options.maxPerSource) break;
    }
    if (data.results.length < pageSize || page * pageSize >= data.totalResults) break;
  }
  return result;
}

const first = (meta: Meta, key: string) => meta[key]?.[0] ?? null;

type BudgetAction = { action: string; expectedGrants?: number; minContribution?: number; maxContribution?: number; budgetYearMap?: Record<string, string> };

/** budgetOverview agrupa todas las acciones de la convocatoria: se toma la línea de este topic. */
export function budgetForTopic(meta: Meta, identifier: string) {
  const raw = first(meta, "budgetOverview");
  if (!raw) return null;
  try {
    const overview = JSON.parse(raw) as { budgetTopicActionMap?: Record<string, BudgetAction[]> };
    const actions = Object.values(overview.budgetTopicActionMap ?? {}).flat();
    const own = actions.filter((a) => a.action?.startsWith(`${identifier} `) || a.action?.startsWith(`${identifier}-`) || a.action === identifier);
    if (!own.length) return null;
    const total = own.reduce((sum, a) => sum + Object.values(a.budgetYearMap ?? {}).reduce((s, v) => s + (Number(v) || 0), 0), 0);
    const mins = own.map((a) => a.minContribution).filter((v): v is number => typeof v === "number" && v > 0);
    const maxs = own.map((a) => a.maxContribution).filter((v): v is number => typeof v === "number" && v > 0);
    const grants = own.reduce((sum, a) => sum + (a.expectedGrants ?? 0), 0);
    return {
      total: total || null,
      min: mins.length ? Math.min(...mins) : null,
      max: maxs.length ? Math.max(...maxs) : null,
      expectedGrants: grants || null,
    };
  } catch {
    return null;
  }
}

export function mapEuTopic(item: EuResult, now: Date): FundingOpportunity | { skip: string } {
  const meta = item.metadata ?? {};
  const identifier = first(meta, "identifier");
  if (!identifier) return { skip: "Resultado sin identificador de topic" };
  if (first(meta, "type") !== "1") return { skip: "No es un topic de convocatoria" };
  const title = first(meta, "title") ?? item.summary;
  const deadlines = (meta.deadlineDate ?? []).map(parseDate).filter((d): d is string => Boolean(d)).sort();
  // En convocatorias de dos fases hay varias fechas: el plazo relevante es el próximo.
  const upcoming = deadlines.find((d) => new Date(d).getTime() >= now.getTime()) ?? deadlines.at(-1) ?? null;
  const opensAt = parseDate(first(meta, "startDate"));
  const budget = budgetForTopic(meta, identifier);
  const programmeId = first(meta, "frameworkProgramme");
  const keywords = [...new Set([...(meta.keywords ?? []), ...(meta.crossCuttingPriorities ?? [])])]
    .filter((k) => k !== identifier && k !== first(meta, "callIdentifier"));
  const statusCode = first(meta, "status");
  let status = computeStatus(opensAt, upcoming, now);
  if (status === "open" && statusCode === EU_STATUS.forthcoming && opensAt && new Date(opensAt) > now) status = "forthcoming";

  return {
    source: "eu_funding_tenders",
    external_id: identifier,
    funder_name: `Comisión Europea · ${EU_PROGRAMMES[programmeId ?? ""] ?? "Programa UE"}`,
    funder_type: "public",
    title,
    summary: truncate(
      [first(meta, "destinationDescription"), stripHtml(first(meta, "descriptionByte"))].filter(Boolean).join("\n\n"),
      4000,
    ),
    url: first(meta, "url") ?? item.url,
    bases_url: null,
    source_url: item.url,
    programme: EU_PROGRAMMES[programmeId ?? ""] ?? programmeId,
    call_identifier: first(meta, "callIdentifier"),
    instrument: (meta.typesOfAction ?? []).join("; ") || null,
    scope: "european",
    regions: [],
    eligible_beneficiaries: [],
    beneficiary_notes: "Eligibility unknown: consult the topic's official eligibility conditions.",
    currency: "EUR",
    total_budget: budget?.total ?? null,
    min_amount: budget?.min ?? null,
    max_amount: budget?.max ?? null,
    expected_grants: budget?.expectedGrants ?? null,
    opens_at: opensAt,
    deadline_at: upcoming,
    deadline_text: deadlines.length > 1 ? `Fases: ${deadlines.map((d) => d.slice(0, 10)).join(" / ")}` : null,
    internal_deadline_at: null,
    status,
    keywords,
    language: first(meta, "language") ?? "en",
    raw: {
      metadata: meta,
      source_summary: item.summary,
      reference: item.reference,
      callTitle: first(meta, "callTitle"),
      deadlineModel: first(meta, "deadlineModel"),
      portalStatus: statusCode,
      programmeId,
    },
  };
}
