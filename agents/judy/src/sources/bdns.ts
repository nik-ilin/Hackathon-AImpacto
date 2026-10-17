// Fuente pública España: Base de Datos Nacional de Subvenciones (SNPSAP / InfoSubvenciones).
// API REST abierta, sin clave. Documentación: https://www.infosubvenciones.es/bdnstrans/doc/swagger
// Reutilización: citar a la Intervención General de la Administración del Estado (IGAE) como fuente.
import type { HttpClient } from "../util/http.ts";
import type { Beneficiary, CollectOptions, FundingOpportunity, SourceResult } from "../types.ts";
import { asHttpsUrl, computeStatus, parseDate, stripHtml, truncate } from "../util/text.ts";

export const BDNS_API = "https://www.infosubvenciones.es/bdnstrans/api";
export const BDNS_FICHA = "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias";
/** Finalidad de la política de gasto "Investigación, desarrollo e innovación" (endpoint /finalidades). */
export const BDNS_FINALIDAD_IDI = 17;

type BdnsListItem = {
  id: number;
  numeroConvocatoria: string;
  descripcion: string;
  fechaRecepcion: string;
  nivel1: string;
  nivel2: string;
  nivel3: string;
};
type BdnsPage = { content: BdnsListItem[]; last: boolean; totalElements: number; number: number };
export type BdnsDetail = {
  codigoBDNS: string;
  descripcion: string;
  descripcionLeng?: string | null;
  descripcionFinalidad?: string | null;
  descripcionBasesReguladoras?: string | null;
  tipoConvocatoria?: string | null;
  fechaRecepcion?: string | null;
  fechaInicioSolicitud?: string | null;
  fechaFinSolicitud?: string | null;
  textInicio?: string | null;
  textFin?: string | null;
  presupuestoTotal?: number | null;
  organo?: { nivel1?: string; nivel2?: string; nivel3?: string } | null;
  regiones?: { descripcion: string }[];
  sectores?: { codigo?: string; descripcion: string }[];
  tiposBeneficiarios?: { descripcion: string }[];
  instrumentos?: { descripcion: string }[];
  urlBasesReguladoras?: string | null;
  sedeElectronica?: string | null;
  anuncios?: { titulo?: string; texto?: string; url?: string }[];
  mrr?: boolean;
};

export type BdnsOptions = {
  /** Solo concurrencia competitiva: las concesiones directas y nominativas no se pueden solicitar. */
  onlyCompetitive?: boolean;
  finalidad?: number;
  pageSize?: number;
};

const ddmmyyyy = (date: Date) =>
  `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;

export async function collectBdns(http: HttpClient, options: CollectOptions, bdns: BdnsOptions = {}): Promise<SourceResult> {
  const result: SourceResult = { source: "bdns", items: [], skipped: [], errors: [] };
  const from = new Date(options.now.getTime() - options.sinceDays * 86_400_000);
  const pageSize = bdns.pageSize ?? 50;
  const listed: BdnsListItem[] = [];

  for (let page = 0; listed.length < options.maxPerSource; page++) {
    const params = new URLSearchParams({
      vpd: "GE",
      page: String(page),
      pageSize: String(pageSize),
      finalidad: String(bdns.finalidad ?? BDNS_FINALIDAD_IDI),
      fechaDesde: ddmmyyyy(from),
      fechaHasta: ddmmyyyy(options.now),
    });
    try {
      const data = await http.getJson<BdnsPage>(`${BDNS_API}/convocatorias/busqueda?${params}`);
      listed.push(...data.content);
      if (data.last || !data.content.length) break;
    } catch (error) {
      result.errors.push(`Búsqueda BDNS página ${page}: ${String(error)}`);
      break;
    }
  }

  for (const item of listed.slice(0, options.maxPerSource)) {
    try {
      const detail = await http.getJson<BdnsDetail>(`${BDNS_API}/convocatorias?vpd=GE&numConv=${encodeURIComponent(item.numeroConvocatoria)}`);
      const mapped = mapBdnsDetail(detail, options.now, bdns);
      if ("skip" in mapped) result.skipped.push({ id: item.numeroConvocatoria, reason: mapped.skip });
      else result.items.push(mapped);
    } catch (error) {
      result.errors.push(`Detalle BDNS ${item.numeroConvocatoria}: ${String(error)}`);
    }
  }
  return result;
}

const BENEFICIARY_MAP: [RegExp, Beneficiary[]][] = [
  [/PERSONAS JUR[IÍ]DICAS QUE NO DESARROLLAN ACTIVIDAD ECON[OÓ]MICA/i, ["university", "research_center", "nonprofit", "public_body"]],
  [/PERSONAS F[IÍ]SICAS QUE NO DESARROLLAN ACTIVIDAD ECON[OÓ]MICA/i, ["individual"]],
  [/PYME|GRAN EMPRESA|PERSONAS F[IÍ]SICAS QUE DESARROLLAN ACTIVIDAD ECON[OÓ]MICA/i, ["company"]],
];

export function mapBdnsDetail(detail: BdnsDetail, now: Date, options: BdnsOptions = {}): FundingOpportunity | { skip: string } {
  const type = detail.tipoConvocatoria ?? "";
  if ((options.onlyCompetitive ?? true) && !/concurrencia competitiva/i.test(type)) {
    return { skip: `No es de concurrencia competitiva (${type || "tipo desconocido"})` };
  }
  const beneficiaryLabels = (detail.tiposBeneficiarios ?? []).map((b) => b.descripcion.trim());
  const beneficiaries = new Set<Beneficiary>();
  for (const label of beneficiaryLabels) for (const [pattern, mapped] of BENEFICIARY_MAP) if (pattern.test(label)) mapped.forEach((b) => beneficiaries.add(b));

  const level1 = detail.organo?.nivel1 ?? "";
  const scope = /ESTADO/i.test(level1) ? "national" : /LOCAL/i.test(level1) ? "local" : /AUTON/i.test(level1) ? "regional" : "national";
  const opensAt = parseDate(detail.fechaInicioSolicitud);
  const deadlineAt = parseDate(detail.fechaFinSolicitud);
  const announcement = (detail.anuncios ?? [])[0];
  const summary = truncate(
    [detail.descripcionBasesReguladoras, stripHtml(announcement?.texto)].filter(Boolean).join("\n\n"),
    4000,
  );
  const deadlineText = deadlineAt ? null : detail.textFin?.trim() || null;

  return {
    source: "bdns",
    external_id: detail.codigoBDNS,
    funder_name: [detail.organo?.nivel2, detail.organo?.nivel3].filter(Boolean).join(" · ") || "Administración pública",
    funder_type: "public",
    title: detail.descripcion.trim(),
    summary,
    url: `${BDNS_FICHA}/${detail.codigoBDNS}`,
    bases_url: asHttpsUrl(detail.urlBasesReguladoras) ?? asHttpsUrl(announcement?.url) ?? null,
    source_url: `${BDNS_FICHA}/${detail.codigoBDNS}`,
    programme: detail.descripcionFinalidad ?? null,
    call_identifier: detail.codigoBDNS,
    instrument: type || null,
    scope,
    regions: (detail.regiones ?? []).map((r) => r.descripcion),
    eligible_beneficiaries: [...beneficiaries],
    beneficiary_notes: beneficiaryLabels.join("; "),
    currency: detail.presupuestoTotal != null ? "EUR" : null,
    total_budget: detail.presupuestoTotal ?? null,
    min_amount: null,
    max_amount: null,
    expected_grants: null,
    opens_at: opensAt,
    deadline_at: deadlineAt,
    deadline_text: deadlineText,
    internal_deadline_at: null,
    // El indicador "abierto" de BDNS no es fiable: el estado se calcula con las fechas del plazo.
    status: computeStatus(opensAt, deadlineAt, now),
    keywords: (detail.sectores ?? []).map((s) => s.descripcion),
    language: "es",
    raw: {
      source_beneficiary_labels: beneficiaryLabels,
      source_budget: detail.presupuestoTotal ?? null,
      source_regulatory_url: detail.urlBasesReguladoras ?? null,
      tipoConvocatoria: type,
      fechaRecepcion: detail.fechaRecepcion,
      textInicio: detail.textInicio,
      textFin: detail.textFin,
      organo: detail.organo,
      sedeElectronica: detail.sedeElectronica,
      mrr: detail.mrr,
      fuente: "Base de Datos Nacional de Subvenciones (IGAE)",
    },
  };
}
