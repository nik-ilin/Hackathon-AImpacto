// Contrato común: cada fuente devuelve convocatorias en este formato normalizado.

export type SourceId = "bdns" | "eu_funding_tenders" | "ucm_otri" | "private_web";

export type Beneficiary = "university" | "research_center" | "hospital" | "company" | "nonprofit" | "individual" | "public_body";

export type CallStatus = "open" | "forthcoming" | "closed" | "unknown";

export type FundingOpportunity = {
  source: SourceId;
  /** Identificador estable dentro de la fuente (código BDNS, identificador del topic, slug…). */
  external_id: string;
  funder_name: string;
  funder_type: "public" | "private";
  title: string;
  summary: string;
  /** Página oficial de la convocatoria (la que debe abrir el investigador). */
  url: string;
  /** Bases reguladoras o reglas de participación, si la fuente las enlaza. */
  bases_url: string | null;
  /** Página donde Judy encontró el dato (puede ser un agregador). */
  source_url: string;
  programme: string | null;
  call_identifier: string | null;
  instrument: string | null;
  scope: "local" | "regional" | "national" | "european" | "international";
  regions: string[];
  eligible_beneficiaries: Beneficiary[];
  beneficiary_notes: string;
  currency: string | null;
  total_budget: number | null;
  min_amount: number | null;
  max_amount: number | null;
  expected_grants: number | null;
  opens_at: string | null;
  deadline_at: string | null;
  /** Plazo en texto cuando la fuente no da una fecha ("20 días hábiles desde la publicación"). */
  deadline_text: string | null;
  /** Plazo interno de la universidad (p. ej. OTRI), anterior al oficial. */
  internal_deadline_at: string | null;
  status: CallStatus;
  keywords: string[];
  language: string;
  /** Extracto del dato original para auditar la normalización. */
  raw: Record<string, unknown>;
};

export type SourceResult = {
  source: SourceId;
  items: FundingOpportunity[];
  /** Elementos vistos pero descartados, con el motivo (p. ej. concesión directa). */
  skipped: { id: string; reason: string }[];
  errors: string[];
};

export type CollectOptions = {
  now: Date;
  /** Días hacia atrás para buscar convocatorias registradas (BDNS). */
  sinceDays: number;
  /** Tope de elementos por fuente para no abusar de las APIs. */
  maxPerSource: number;
};
