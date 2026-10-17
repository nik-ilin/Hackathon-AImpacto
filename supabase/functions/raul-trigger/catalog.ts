/** Small, auditable source contract shared by the collector and its tests. */
export type SourceSpec = {
  id: string;
  url: string;
  externalId: string | null;
  provider: string;
  title: string;
  type: "research_internship" | "scholarship" | "fellowship";
  titleEvidence: RegExp;
  deadlineEvidence: RegExp;
  academicStages: string[];
  stageEvidence: RegExp;
  degreeAreas: string[];
  areaEvidence: RegExp;
  residence: string | null;
  residenceEvidence?: RegExp;
  amount: string | null;
  amountEvidence?: RegExp;
  applicationUrl: string | null;
  basesUrl: string | null;
  summary: string;
};

// These URLs and facts were checked against the official pages on 2026-10-17.
// A later scrape must still contain the evidence expressions; otherwise it is
// rejected for manual review, never silently republished as current.
export const sourceSpecs: readonly SourceSpec[] = [
  {
    id: "imdea_energy_2027",
    url: "https://energia.imdea.org/en/imdea-energy-launches-30-internships-for-bachelors-and-masters-students-in-2027/",
    externalId: "internships-2027",
    provider: "IMDEA Energía",
    title: "Prácticas de investigación IMDEA Energía 2027",
    type: "research_internship",
    titleEvidence: /30 internships|30 prácticas/i,
    deadlineEvidence: /(?:deadline|applications? close|plazo|hasta el).{0,90}?(?<date>\d{1,2}(?:st|nd|rd|th)?\s+(?:(?:de|of)\s+)?[a-záéíóú]+\s+(?:de\s+)?20\d{2})(?<tail>.{0,60})/i,
    academicStages: ["bachelor", "master"],
    stageEvidence: /bachelor.{0,30}master|grado.{0,30}m[aá]ster/i,
    degreeAreas: [],
    areaEvidence: /energy|energ[ií]a/i,
    residence: "Permiso de residencia en España durante las prácticas",
    residenceEvidence: /residence permit.{0,80}spain|permiso de residencia.{0,80}españa/i,
    amount: "Hasta 2.200 € (Grado) o 2.500 € (Máster)",
    amountEvidence: /2[,.]200.{0,120}2[,.]500|2[,.]500.{0,120}2[,.]200/i,
    applicationUrl: null,
    basesUrl: null,
    summary: "30 prácticas de investigación remuneradas para estudiantes de Grado y Máster.",
  },
  {
    id: "upm_metrologia_2026",
    url: "https://minasyenergia.upm.es/la-escuela/ultimas-noticias/noticias-estudiantes/noticias-becas-y-ayudas/beca-metrologia-y-analisis-de-datos-en-las-areas-de-volumen-y-temperatura",
    externalId: null,
    provider: "Universidad Politécnica de Madrid",
    title: "Beca de metrología y análisis de datos",
    type: "scholarship",
    titleEvidence: /metrolog[ií]a.{0,80}an[aá]lisis de datos/i,
    deadlineEvidence: /(?:plazo|fecha l[ií]mite|hasta el).{0,90}?(?<date>\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+20\d{2})(?<tail>.{0,60})/i,
    academicStages: ["bachelor"],
    stageEvidence: /estudiantes? de grado|grado en ingenier[ií]a/i,
    degreeAreas: ["Ingeniería"],
    areaEvidence: /ingenier[ií]a/i,
    residence: null,
    amount: "300 € brutos mensuales",
    amountEvidence: /300\s*(?:€|euros)/i,
    applicationUrl: null,
    basesUrl: null,
    summary: "Beca de metrología y análisis de datos en volumen y temperatura.",
  },
  {
    id: "rtve_tfm_2026",
    url: "https://www.rtve.es/rtve/20261006/convocatoria-impulsa-vision-rtve-ayudas-investigacion-oficiales-tfm/17254848.shtml",
    externalId: "ix-impulsa-vision-tfm-2026",
    provider: "RTVE",
    title: "IX Ayudas a la Investigación para TFM Impulsa Visión RTVE",
    type: "scholarship",
    titleEvidence: /impulsa visi[oó]n.{0,100}(?:tfm|investigaci[oó]n)|ayudas a la investigaci[oó]n.{0,100}tfm/i,
    deadlineEvidence: /(?:fecha l[ií]mite|plazo|hasta el).{0,90}?(?<date>\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+20\d{2})(?<tail>.{0,60})/i,
    academicStages: ["master"],
    stageEvidence: /m[aá]ster oficial/i,
    degreeAreas: [],
    areaEvidence: /tfm/i,
    residence: null,
    amount: "8.000 € al estudiante y 4.000 € al centro",
    amountEvidence: /8[.,]000.{0,160}4[.,]000|4[.,]000.{0,160}8[.,]000/i,
    applicationUrl: null,
    basesUrl: "https://static.rtve.es/resources/pdf/2/1/4/2/01791277132412.pdf",
    summary: "Ayudas para TFM de Máster oficial sobre nuevas audiencias y contenidos informativos digitales.",
  },
];

export function canonicalOfficialUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("official_url_https_required");
  url.hash = "";
  // Keep identifiers in query parameters; remove only known tracking fields.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function stableExternalId(spec: Pick<SourceSpec, "externalId" | "url">): string {
  // Source-scoped canonical URL is the documented fallback if no source ID exists.
  return spec.externalId?.trim() || `url:${canonicalOfficialUrl(spec.url)}`;
}

export function validateDeadline(value: string, now: Date): "open" | "closed" {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("invalid_deadline");
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const local = (name: string) => parts.find((part) => part.type === name)?.value ?? "";
    return value >= `${local("year")}-${local("month")}-${local("day")}` ? "open" : "closed";
  }
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) throw new Error("invalid_deadline");
  return deadline.getTime() >= now.getTime() ? "open" : "closed";
}

const months: Record<string, number> = {
  january: 1, febrero: 2, february: 2, enero: 1, march: 3, marzo: 3,
  april: 4, abril: 4, may: 5, mayo: 5, june: 6, junio: 6,
  july: 7, julio: 7, august: 8, agosto: 8, september: 9, septiembre: 9,
  october: 10, octubre: 10, november: 11, noviembre: 11, december: 12, diciembre: 12,
};

export function parseOfficialDeadline(evidence: RegExpMatchArray): { date: string; at: string | null } {
  const dateCandidates = `${evidence.groups?.date ?? ""} ${evidence.groups?.tail ?? ""}`
    .match(/\d{1,2}(?:st|nd|rd|th)?\s+(?:(?:de|of)\s+)?[a-záéíóú]+\s+(?:de\s+)?20\d{2}/gi);
  const selected = dateCandidates?.at(-1);
  const raw = selected?.toLowerCase().replace(/(?<=\d)(st|nd|rd|th)\b/g, "").replace(/\b(?:de|of)\b/g, " ").replace(/\s+/g, " ").trim();
  const match = raw?.match(/^(\d{1,2}) ([a-záéíóú]+) (20\d{2})$/);
  if (!match || !months[match[2]]) throw new Error("invalid_official_deadline");
  const date = `${match[3]}-${String(months[match[2]]).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  if (new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("invalid_official_deadline");
  const tailAfterSelected = `${evidence.groups?.date ?? ""} ${evidence.groups?.tail ?? ""}`.split(selected ?? "").at(-1) ?? "";
  const time = tailAfterSelected.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!time) return { date, at: null };
  const hour = Number(time[1]);
  const minute = Number(time[2]);
  if (hour > 23 || minute > 59) throw new Error("invalid_official_deadline");
  const offsetText = new Intl.DateTimeFormat("en", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${date}T12:00:00Z`)).find((part) => part.type === "timeZoneName")?.value;
  const offsetHour = Number(offsetText?.match(/GMT\+(\d+)/)?.[1]);
  if (![1, 2].includes(offsetHour)) throw new Error("invalid_madrid_offset");
  return { date, at: `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+0${offsetHour}:00` };
}

export function extractOfficialPage(spec: SourceSpec, markdown: string, now: Date) {
  const text = markdown.replace(/\s+/g, " ");
  const deadlineEvidence = text.match(spec.deadlineEvidence);
  if (text.length < 100 || !spec.titleEvidence.test(text) || !deadlineEvidence) {
    throw new Error("official_evidence_missing");
  }
  const deadline = parseOfficialDeadline(deadlineEvidence);
  const stageConfirmed = spec.stageEvidence.test(text);
  const areaConfirmed = spec.areaEvidence.test(text);
  const residenceConfirmed = spec.residenceEvidence?.test(text) ?? false;
  const amountConfirmed = spec.amountEvidence?.test(text) ?? false;
  const missing = [
    !stageConfirmed && "etapa académica",
    (!areaConfirmed || spec.degreeAreas.length === 0) && "área o titulación",
    spec.residence && !residenceConfirmed && "residencia",
    spec.amount && !amountConfirmed && "importe",
    !spec.applicationUrl && "URL de solicitud",
    !spec.basesUrl && "bases completas",
  ].filter((value): value is string => Boolean(value));
  const checkedAt = now.toISOString();
  return {
    source_id: spec.id,
    external_id: stableExternalId(spec),
    opportunity_type: spec.type,
    title: spec.title,
    provider: spec.provider,
    summary: spec.summary,
    official_url: canonicalOfficialUrl(spec.url),
    application_url: spec.applicationUrl,
    bases_url: spec.basesUrl,
    country: spec.residence && residenceConfirmed ? "ES" : null,
    opens_at: null,
    official_deadline_date: deadline.date,
    official_deadline_at: deadline.at,
    internal_deadline_at: null,
    status: validateDeadline(deadline.at ?? deadline.date, now),
    checked_at: checkedAt,
    provenance: {
      source_url: canonicalOfficialUrl(spec.url),
      extraction_method: "firecrawl_markdown_rule",
      parser_version: "raul-1.0.0",
      evidence: {
        title: spec.titleEvidence.source,
        deadline: spec.deadlineEvidence.source,
        stage: stageConfirmed ? spec.stageEvidence.source : null,
        area: areaConfirmed ? spec.areaEvidence.source : null,
        residence: residenceConfirmed ? spec.residenceEvidence?.source : null,
        amount: amountConfirmed ? spec.amountEvidence?.source : null,
      },
    },
    scholarship_details: {
      academic_stages: stageConfirmed ? spec.academicStages : [],
      degree_areas: areaConfirmed ? spec.degreeAreas : [],
      residence_requirement: residenceConfirmed ? { value: spec.residence, state: "confirmed" } : { value: null, state: "unknown" },
      amount: amountConfirmed ? { value: spec.amount, state: "confirmed" } : { value: null, state: "unknown" },
      requirements: [
        { key: "academic_stage", label: "Etapa académica", value: stageConfirmed ? spec.academicStages : null, state: stageConfirmed ? "confirmed" : "unknown", source_url: stageConfirmed ? spec.url : null },
        { key: "degree_area", label: "Titulación o área", value: areaConfirmed && spec.degreeAreas.length ? spec.degreeAreas : null, state: areaConfirmed && spec.degreeAreas.length ? "confirmed" : "unknown", source_url: areaConfirmed && spec.degreeAreas.length ? spec.url : null },
        { key: "residence", label: "Residencia", value: residenceConfirmed ? spec.residence : null, state: residenceConfirmed ? "confirmed" : "unknown", source_url: residenceConfirmed ? spec.url : null },
      ],
      missing_information: missing,
    },
  };
}
