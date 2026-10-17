// Fuente privada genérica: páginas de convocatorias de fundaciones y entidades privadas (webs sin API).
// Motor principal: Firecrawl (/v2/scrape) en UNA llamada por página que devuelve markdown, enlaces y
// la extracción estructurada (formato "json" con esquema). Alternativa sin Firecrawl: descarga directa
// respetando robots.txt + extracción con Claude.
// Barrera anti-alucinación (en ambos casos): se descarta todo resultado cuyo título no aparezca en el texto
// de la página y todo enlace que no esté en la propia página.
import * as cheerio from "cheerio";
import type { HttpClient } from "../util/http.ts";
import type { CollectOptions, FundingOpportunity, SourceResult } from "../types.ts";
import { asHttpsUrl, computeStatus, parseDate, slugify, truncate } from "../util/text.ts";

export type PrivatePage = { id: string; funder_name: string; url: string };

export type PrivateWebEnv = {
  firecrawlApiKey?: string;
  firecrawlUrl?: string;
  /** Firecrawl reutiliza su caché si es más reciente que esto: ahorra créditos en ejecuciones seguidas. */
  firecrawlMaxAgeMs?: number;
  anthropicApiKey?: string;
  llmModel?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
};

type PageContent = { text: string; links: string[] };
type Extracted = { title: string; summary?: string; url?: string; deadline?: string; opens?: string; max_amount?: number; currency?: string; beneficiaries?: string };

export async function collectPrivateWeb(http: HttpClient, options: CollectOptions, pages: PrivatePage[], env: PrivateWebEnv): Promise<SourceResult> {
  const result: SourceResult = { source: "private_web", items: [], skipped: [], errors: [] };
  const useFirecrawl = Boolean(env.firecrawlApiKey);
  const useClaude = Boolean(env.anthropicApiKey && env.llmModel);
  if (!useFirecrawl && !useClaude) {
    result.errors.push("Fuentes privadas genéricas desactivadas: configura FIRECRAWL_API_KEY (recomendado) o ANTHROPIC_API_KEY + JUDY_LLM_MODEL.");
    return result;
  }
  for (const page of pages) {
    try {
      const { content, entries } = useFirecrawl
        ? await scrapeWithFirecrawl(page, env)
        : await (async () => {
            const content = htmlToContent(await http.getText(page.url), page.url);
            return { content, entries: await extractWithLlm(page, content, env) };
          })();
      for (const entry of entries) {
        const checked = verifyExtraction(entry, content, page, options.now);
        if ("skip" in checked) result.skipped.push({ id: `${page.id}:${entry.title}`, reason: checked.skip });
        else result.items.push(checked);
      }
    } catch (error) {
      result.errors.push(`${page.id}: ${String(error)}`);
    }
  }
  return result;
}

export function htmlToContent(html: string, baseUrl: string): PageContent {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, noscript, svg").remove();
  const links = $("a[href]").map((_, a) => {
    try {
      return new URL($(a).attr("href") ?? "", baseUrl).toString();
    } catch {
      return "";
    }
  }).get().filter((href) => href.startsWith("https://"));
  const root = $("main").length ? $("main") : $("body");
  return { text: root.text().replace(/\s+/g, " ").trim().slice(0, 60_000), links: [...new Set(links)] };
}

export const FIRECRAWL_PROMPT = [
  "Extrae SOLO las convocatorias, becas, ayudas o premios de investigación científica que aparezcan en la página.",
  "Copia el título tal como aparece. No inventes datos: si un campo no aparece, omítelo.",
  "Fechas en formato AAAA-MM-DD. Excluye noticias, eventos, resoluciones de convocatorias ya resueltas y ofertas de empleo no científicas.",
].join(" ");

/** Una sola llamada a Firecrawl: markdown + enlaces + extracción estructurada con el esquema de Judy. */
async function scrapeWithFirecrawl(page: PrivatePage, env: PrivateWebEnv): Promise<{ content: PageContent; entries: Extracted[] }> {
  const doFetch = env.fetch ?? fetch;
  const response = await doFetch(env.firecrawlUrl ?? "https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { authorization: `Bearer ${env.firecrawlApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      url: page.url,
      onlyMainContent: true,
      maxAge: env.firecrawlMaxAgeMs ?? 86_400_000,
      formats: ["markdown", "links", { type: "json", schema: EXTRACTION_TOOL.input_schema, prompt: FIRECRAWL_PROMPT }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Firecrawl HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as {
    success?: boolean;
    data?: { markdown?: string; links?: string[]; json?: { convocatorias?: Extracted[] } };
  };
  if (body.success === false || !body.data) throw new Error("Firecrawl no devolvió datos");
  return {
    content: {
      text: (body.data.markdown ?? "").slice(0, 200_000),
      links: (body.data.links ?? []).filter((l) => l.startsWith("https://")),
    },
    entries: Array.isArray(body.data.json?.convocatorias) ? body.data.json.convocatorias : [],
  };
}

const EXTRACTION_TOOL = {
  name: "registrar_convocatorias",
  description: "Registra las convocatorias de financiación de investigación que aparecen literalmente en la página.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["convocatorias"],
    properties: {
      convocatorias: {
        type: "array",
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title"],
          properties: {
            title: { type: "string", description: "Título tal como aparece en la página" },
            summary: { type: "string", description: "Objeto de la ayuda, máximo 600 caracteres" },
            url: { type: "string", description: "Enlace https de la página a esa convocatoria, si existe" },
            opens: { type: "string", description: "Apertura en formato AAAA-MM-DD si aparece" },
            deadline: { type: "string", description: "Fin de plazo en formato AAAA-MM-DD si aparece" },
            max_amount: { type: "number", description: "Importe máximo por ayuda si aparece" },
            currency: { type: "string", description: "Código de 3 letras, p. ej. EUR" },
            beneficiaries: { type: "string", description: "Quién puede solicitarla, resumido" },
          },
        },
      },
    },
  },
};

async function extractWithLlm(page: PrivatePage, content: PageContent, env: PrivateWebEnv): Promise<Extracted[]> {
  const doFetch = env.fetch ?? fetch;
  const prompt = [
    `Eres Judy, el agente de NexoLab que recopila convocatorias de financiación para investigación.`,
    `Página de ${page.funder_name}: ${page.url}`,
    "Extrae SOLO las convocatorias, becas, ayudas o premios de investigación que aparezcan en el texto.",
    "No inventes datos: si un campo no aparece, omítelo. No incluyas noticias, eventos ni convocatorias de otros tipos.",
    "Usa como url únicamente enlaces de la lista proporcionada.",
    "",
    "Enlaces de la página:",
    content.links.slice(0, 200).join("\n"),
    "",
    "Texto de la página:",
    content.text,
  ].join("\n");
  const response = await doFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.anthropicApiKey ?? "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env.llmModel,
      max_tokens: 4000,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
  const body = (await response.json()) as { content?: { type: string; input?: { convocatorias?: Extracted[] } }[] };
  const call = body.content?.find((c) => c.type === "tool_use");
  return Array.isArray(call?.input?.convocatorias) ? call.input.convocatorias : [];
}

/** Normaliza texto plano o markdown (quita enlaces, énfasis y encabezados) para comparar títulos. */
const norm = (s: string) => s
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[*_#`>|]/g, " ")
  .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Barrera anti-alucinación: el título debe existir en la página y el enlace debe ser uno de sus enlaces. */
export function verifyExtraction(entry: Extracted, content: PageContent, page: PrivatePage, now: Date): FundingOpportunity | { skip: string } {
  const title = (entry.title ?? "").trim();
  if (title.length < 5) return { skip: "Título vacío o demasiado corto" };
  if (!norm(content.text).includes(norm(title))) return { skip: "El título no aparece en el texto de la página" };
  const candidate = asHttpsUrl(entry.url);
  const url = candidate && content.links.includes(candidate) ? candidate : page.url;
  const deadlineAt = parseDate(entry.deadline);
  const opensAt = parseDate(entry.opens);
  const currency = entry.currency && /^[A-Z]{3}$/.test(entry.currency) ? entry.currency : null;
  const maxAmount = typeof entry.max_amount === "number" && entry.max_amount > 0 ? entry.max_amount : null;
  return {
    source: "private_web",
    external_id: slugify(`${page.id} ${title}`),
    funder_name: page.funder_name,
    funder_type: "private",
    title,
    summary: truncate(entry.summary ?? "", 1500),
    url,
    bases_url: null,
    source_url: page.url,
    programme: null,
    call_identifier: null,
    instrument: null,
    scope: "national",
    regions: [],
    eligible_beneficiaries: [],
    beneficiary_notes: truncate(entry.beneficiaries ?? "", 1000),
    // Un importe sin moneda explícita no se guarda: mejor vacío que supuesto.
    currency: maxAmount && currency ? currency : null,
    total_budget: null,
    min_amount: null,
    max_amount: currency ? maxAmount : null,
    expected_grants: null,
    opens_at: opensAt,
    deadline_at: deadlineAt,
    deadline_text: null,
    internal_deadline_at: null,
    status: computeStatus(opensAt, deadlineAt, now),
    keywords: [],
    language: "es",
    raw: { extraction: "llm", page: page.id },
  };
}
