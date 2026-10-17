import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { HttpClient } from "../src/util/http.ts";
import { collectBdns, mapBdnsDetail, type BdnsDetail } from "../src/sources/bdns.ts";
import { collectEuFundingTenders, budgetForTopic, mapEuTopic, type EuResult } from "../src/sources/euFundingTenders.ts";
import { parseUcmOtri } from "../src/sources/ucmOtri.ts";
import { collectPrivateWeb, htmlToContent, verifyExtraction } from "../src/sources/privateWeb.ts";
import { collect, hashOpportunity, toCsv } from "../src/pipeline.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const json = <T>(name: string) => JSON.parse(fixture(name)) as T;
const NOW = new Date("2026-10-17T10:00:00Z");
const options = { now: NOW, sinceDays: 120, maxPerSource: 50 };

/** Cliente HTTP falso que sirve fixtures según la URL y registra las peticiones. */
function fakeHttp(routes: Record<string, unknown>): HttpClient & { calls: string[] } {
  const calls: string[] = [];
  const find = (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`Sin fixture para ${url}`);
    return routes[key];
  };
  return {
    calls,
    stats: { requests: 0, retries: 0, blockedByRobots: 0 },
    async getText(url) { return find(url) as string; },
    async getJson<T>(url: string) { return find(url) as T; },
    async postForm<T>(url: string) { return find(url) as T; },
  };
}

describe("BDNS (datos reales capturados el 17/10/2026)", () => {
  it("convocatoria competitiva con fechas: estado calculado por fechas aunque BDNS diga abierto=false", () => {
    const item = mapBdnsDetail(json<BdnsDetail>("bdns-detail-933468.json"), NOW);
    if ("skip" in item) throw new Error(item.skip);
    expect(item.status).toBe("open");
    expect(item.deadline_at).toBe("2026-11-03T22:59:59.000Z");
    expect(item.opens_at).toBe("2026-09-15T21:59:59.000Z");
    expect(item.url).toBe("https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/933468");
    expect(item.bases_url).toBe("https://www.navarra.es/");
    expect(item.eligible_beneficiaries).toEqual(["individual"]);
    expect(item.scope).toBe("regional");
    expect(item.total_budget).toBe(55000);
    expect(item.currency).toBe("EUR");
    expect(item.keywords).toEqual(["Investigación y desarrollo"]);
  });

  it("plazo solo en texto: se conserva como deadline_text y el estado queda 'unknown'", () => {
    const item = mapBdnsDetail(json<BdnsDetail>("bdns-detail-933859.json"), NOW);
    if ("skip" in item) throw new Error(item.skip);
    expect(item.deadline_at).toBeNull();
    expect(item.deadline_text).toBe("A los veinte días hábiles desde el día siguiente de su publicación en BOR");
    expect(item.status).toBe("unknown");
    expect(item.eligible_beneficiaries).toEqual(expect.arrayContaining(["university", "research_center"]));
  });

  it("descarta concesiones directas/nominativas (no se pueden solicitar)", () => {
    const item = mapBdnsDetail(json<BdnsDetail>("bdns-detail-935984.json"), NOW);
    expect(item).toEqual({ skip: "No es de concurrencia competitiva (Concesión directa - instrumental)" });
  });

  it("consulta la finalidad I+D+i con fechas dd/mm/aaaa y pide el detalle de cada convocatoria", async () => {
    const http = fakeHttp({
      "/convocatorias/busqueda": json("bdns-search.json"),
      "numConv=933468": json("bdns-detail-933468.json"),
      "numConv=933859": json("bdns-detail-933859.json"),
      "numConv=935984": json("bdns-detail-935984.json"),
    });
    const result = await collectBdns(http, options);
    const search = new URL(http.calls[0]);
    expect(search.searchParams.get("finalidad")).toBe("17");
    expect(search.searchParams.get("fechaDesde")).toBe("19/06/2026");
    expect(search.searchParams.get("fechaHasta")).toBe("17/10/2026");
    expect(result.items.map((i) => i.external_id)).toEqual(["933468", "933859"]);
    expect(result.skipped).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });
});

describe("EU Funding & Tenders (respuesta real de la Search API)", () => {
  const data = json<{ totalResults: number; results: EuResult[] }>("eu-search.json");

  it("toma el presupuesto de la línea de SU topic dentro del budgetOverview de la convocatoria", () => {
    expect(budgetForTopic(data.results[0].metadata, "HORIZON-CL5-2026-11-D3-23")).toEqual({ total: 30000000, min: 10000000, max: 10000000, expectedGrants: 3 });
  });

  it("mapea un topic abierto de Horizon Europe", () => {
    const item = mapEuTopic(data.results[0], NOW);
    if ("skip" in item) throw new Error(item.skip);
    expect(item.external_id).toBe("HORIZON-CL5-2026-11-D3-23");
    expect(item.funder_name).toBe("Comisión Europea · Horizon Europe");
    expect(item.deadline_at).toBe("2026-12-01T00:00:00.000Z");
    expect(item.status).toBe("open");
    expect(item.max_amount).toBe(10000000);
    expect(item.keywords).toEqual(["RePowerEU", "DigitalAgenda", "EoscAndFairData", "AI"]);
    expect(item.summary).toContain("Expected Outcome");
    expect(item.summary).not.toContain("<p");
  });

  it("filtra por topics, estado y programa, marca los próximos y no duplica idiomas", async () => {
    const http = fakeHttp({ "search-api/prod/rest/search": data });
    const result = await collectEuFundingTenders(http, options);
    expect(http.calls[0]).toContain("apiKey=SEDIA");
    expect(result.items.map((i) => [i.external_id, i.status])).toEqual([
      ["HORIZON-CL5-2026-11-D3-23", "open"],
      ["HORIZON-CL5-2027-05-D4-05", "forthcoming"],
    ]);
  });
});

describe("OTRI UCM (estructura real de la página)", () => {
  const { items, skipped } = parseUcmOtri(fixture("ucm-otri.html"), "https://www.ucm.es/otri/financiacion-convocatorias-privadas", NOW);

  it("extrae fundación, enlace oficial (no login, no UCM), bases y ambos plazos", () => {
    expect(items).toHaveLength(2);
    const caixa = items[0];
    expect(caixa.funder_name).toBe('Fundación "la Caixa"');
    expect(caixa.funder_type).toBe("private");
    expect(caixa.url).toBe("https://caixaresearch.org/es/convocatoria-caixaresearch-investigacion-salud");
    expect(caixa.bases_url).toContain("rules-participation");
    expect(caixa.internal_deadline_at).toBe("2026-11-11T22:59:59.000Z");
    expect(caixa.deadline_at).toBe("2026-11-19T22:59:59.000Z");
    expect(caixa.status).toBe("open");
    expect(caixa.source_url).toBe("https://www.ucm.es/otri/financiacion-convocatorias-privadas");
  });

  it("respeta 'Cerrado' de la página y no usa la plataforma de login como enlace oficial", () => {
    const aecc = items[1];
    expect(aecc.status).toBe("closed");
    expect(aecc.url).toBe("https://www.contraelcancer.es/es/area-investigador/ayudas/talento/investigador-aecc-2027");
    expect(aecc.deadline_at).toBe("2026-10-15T21:59:59.000Z");
    expect(aecc.eligible_beneficiaries).toContain("individual");
    expect(skipped).toHaveLength(1);
  });
});

describe("Webs privadas con LLM (barrera anti-alucinación)", () => {
  const page = { id: "fundacion-x", funder_name: "Fundación X", url: "https://fundacionx.org/convocatorias" };
  const content = htmlToContent(
    `<main><h2>Ayudas a la investigación en física 2027</h2><p>Plazo hasta el 30 de noviembre de 2026.</p>
     <a href="/convocatorias/fisica-2027">Ver bases</a></main>`,
    page.url,
  );

  it("descarta títulos que no aparecen en la página y enlaces que la página no contiene", () => {
    expect(verifyExtraction({ title: "Premio inventado de astrobiología" }, content, page, NOW)).toEqual({ skip: "El título no aparece en el texto de la página" });
    expect(verifyExtraction({ title: "Ayudas a la investigación en física 2027", url: "https://otra-web.com/x" }, content, page, NOW)).toEqual({ skip: "No unique source-linked HTTPS URL; ambiguous listing identity" });
    const ok = verifyExtraction({ title: "Ayudas a la investigación en física 2027", url: "https://fundacionx.org/convocatorias/fisica-2027", deadline: "2026-11-30", max_amount: 50000, currency: "EUR" }, content, page, NOW);
    if ("skip" in ok) throw new Error(ok.skip);
    expect(ok.url).toBe("https://fundacionx.org/convocatorias/fisica-2027");
    expect(ok.max_amount).toBeNull(); // sin moneda explícita no se guarda el importe
    expect(ok.status).toBe("unknown");
  });

  it("sin Firecrawl ni LLM avisa y no inventa nada", async () => {
    const result = await collectPrivateWeb(fakeHttp({}), options, [page], {});
    expect(result.items).toEqual([]);
    expect(result.errors[0]).toContain("FIRECRAWL_API_KEY");
  });

  it("alternativa sin Firecrawl: descarga directa + Claude simulado, solo pasa lo verificable", async () => {
    const llm = async () => new Response(JSON.stringify({ content: [{ type: "tool_use", input: { convocatorias: [
      { title: "Ayudas a la investigación en física 2027", url: "https://fundacionx.org/convocatorias/fisica-2027", deadline: "2026-11-30", max_amount: 50000, currency: "EUR" },
      { title: "Convocatoria que no existe" },
    ] } }] }), { status: 200 });
    const http = fakeHttp({ "fundacionx.org": `<main><h2>Ayudas a la investigación en física 2027</h2><p>Importe 50000 EUR.</p><a href="/convocatorias/fisica-2027">Bases</a></main>` });
    const result = await collectPrivateWeb(http, options, [page], { anthropicApiKey: "k", llmModel: "m", fetch: llm });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toBe("https://fundacionx.org/convocatorias/fisica-2027");
    expect(result.items[0].max_amount).toBeNull();
    expect(result.items[0].raw.proposed_extraction).toMatchObject({ max_amount: 50000 });
    expect(result.skipped).toHaveLength(1);
  });
});

describe("Firecrawl (motor principal para webs sin API)", () => {
  const page = { id: "fundacion-x", funder_name: "Fundación X", url: "https://fundacionx.org/convocatorias" };

  it("una sola llamada /v2/scrape con markdown, enlaces y extracción JSON; verifica contra el markdown", async () => {
    const requests: { url: string; body: Record<string, unknown>; auth: string }[] = [];
    const firecrawl = async (url: string, init?: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init?.body)), auth: (init?.headers as Record<string, string>).authorization });
      return new Response(JSON.stringify({ success: true, data: {
        markdown: "## **Ayudas a la investigación en física 2027**\n\nImporte 30000 EUR. Plazo: [ver bases](https://fundacionx.org/bases.pdf) hasta el 30 de noviembre de 2026.",
        links: ["https://fundacionx.org/convocatorias/fisica-2027", "https://fundacionx.org/bases.pdf"],
        json: { convocatorias: [
          { title: "Ayudas a la investigación en física 2027", url: "https://fundacionx.org/convocatorias/fisica-2027", deadline: "2026-11-30", max_amount: 30000, currency: "EUR" },
          { title: "Becas de astrología cuántica", url: "https://fundacionx.org/astro" },
        ] },
      } }), { status: 200 });
    };
    const result = await collectPrivateWeb(fakeHttp({}), options, [page], { firecrawlApiKey: "fc-test", fetch: firecrawl });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(requests[0].auth).toBe("Bearer fc-test");
    const formats = requests[0].body.formats as unknown[];
    expect(formats.slice(0, 2)).toEqual(["markdown", "links"]);
    expect(formats[2]).toMatchObject({ type: "json", prompt: expect.stringContaining("No inventes") });
    expect(requests[0].body.maxAge).toBe(86_400_000);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ title: "Ayudas a la investigación en física 2027", max_amount: null, currency: null, status: "unknown", url: "https://fundacionx.org/convocatorias/fisica-2027" });
    expect(result.items[0].raw.proposed_extraction).toMatchObject({ max_amount: 30000, currency: "EUR" });
    expect(result.skipped).toEqual([{ id: "fundacion-x:Becas de astrología cuántica", reason: "El título no aparece en el texto de la página" }]);
  });

  it("un error de Firecrawl se informa por página sin detener el resto", async () => {
    const pages = [page, { ...page, id: "otra", url: "https://otra.org/ayudas" }];
    const firecrawl = async (_url: string, init?: RequestInit) => JSON.parse(String(init?.body)).url.includes("otra")
      ? new Response(JSON.stringify({ success: true, data: { markdown: "# Premio de física 2027", links: ["https://otra.org/premio-2027"], json: { convocatorias: [{ title: "Premio de física 2027", url: "https://otra.org/premio-2027" }] } } }))
      : new Response("payment required", { status: 402 });
    const result = await collectPrivateWeb(fakeHttp({}), options, pages, { firecrawlApiKey: "fc", fetch: firecrawl });
    expect(result.errors[0]).toContain("HTTP 402");
    expect(result.items.map((i) => i.title)).toEqual(["Premio de física 2027"]);
  });
});

describe("Pipeline", () => {
  it("combina fuentes, informa por fuente, ordena por plazo y exporta CSV", async () => {
    const http = fakeHttp({
      "/convocatorias/busqueda": json("bdns-search.json"),
      "numConv=933468": json("bdns-detail-933468.json"),
      "numConv=933859": json("bdns-detail-933859.json"),
      "numConv=935984": json("bdns-detail-935984.json"),
      "search-api/prod/rest/search": json("eu-search.json"),
      "ucm.es/otri": fixture("ucm-otri.html"),
    });
    const report = await collect(http, options, ["bdns", "eu_funding_tenders", "ucm_otri"]);
    expect(report.items).toHaveLength(6);
    expect(report.stats.bdns).toEqual({ collected: 2, skipped: 1, errors: 0, open: 1, forthcoming: 0 });
    expect(report.items[0].deadline_at! <= report.items[1].deadline_at!).toBe(true);
    expect(report.items.every((i) => /^[0-9a-f]{64}$/.test(i.content_hash))).toBe(true);
    const csv = toCsv(report.items);
    expect(csv.split("\n")[0]).toContain("source,external_id,status");
    expect(csv).toContain('"Fundación ""la Caixa"""');
  });

  it("el hash ignora el estado (cambia con la fecha) pero no el contenido", () => {
    const item = mapBdnsDetail(json<BdnsDetail>("bdns-detail-933468.json"), NOW);
    if ("skip" in item) throw new Error(item.skip);
    expect(hashOpportunity({ ...item, status: "closed" })).toBe(hashOpportunity(item));
    expect(hashOpportunity({ ...item, title: `${item.title} (corrección)` })).not.toBe(hashOpportunity(item));
  });
});

describe("source identity and conservative evidence regressions", () => {
  it("never inherits Beta deadlines, amounts, currency, beneficiaries or summary into Alpha from a shared listing", () => {
    const page = { id: "listing", funder_name: "Funder", url: "https://funder.example/calls" };
    const content = { text: "Alpha research call. Beta research call: opens 2098-12-01, deadline 2099-01-31, 50000 EUR, universities only.", links: ["https://funder.example/alpha", "https://funder.example/beta"] };
    const result = verifyExtraction({ title: "Alpha research call", url: content.links[0], summary: "Beta research call gives 50000 EUR", opens: "2098-12-01", deadline: "2099-01-31", max_amount: 50000, currency: "EUR", beneficiaries: "universities only" }, content, page, NOW);
    if ("skip" in result) throw new Error(result.skip);
    expect(result).toMatchObject({ summary: "Alpha research call", opens_at: null, deadline_at: null, max_amount: null, min_amount: null, total_budget: null, currency: null, beneficiary_notes: "", eligible_beneficiaries: [], status: "unknown" });
    expect(result.raw.proposed_extraction).toMatchObject({ max_amount: 50000, deadline: "2099-01-31" });
    expect(result.raw.extraction).toBe("llm_unverified");
  });
  it("keeps UCM identity through title corrections and never substitutes an internal deadline", () => {
    const html = fixture("ucm-otri.html");
    const original = parseUcmOtri(html, "https://www.ucm.es/otri/financiacion-convocatorias-privadas", NOW).items[0];
    const changed = parseUcmOtri(html.replace("Investigación en Salud 2027 - Health Research Call", "Investigación en Salud 2027 - corrected title").replace("19 de noviembre de 2026", "Sin fecha oficial"), "https://www.ucm.es/otri/financiacion-convocatorias-privadas", NOW).items[0];
    expect(changed.external_id).toBe(original.external_id);
    expect(changed.title).not.toBe(original.title);
    expect(changed.deadline_at).toBeNull();
    expect(changed.internal_deadline_at).toBe("2026-11-11T22:59:59.000Z");
    expect(changed.status).toBe("unknown");
  });
  it("keeps private identity through title corrections and rejects listing-only or HTTP links", () => {
    const page = { id: "stable-source", funder_name: "Funder", url: "https://funder.example/calls" };
    const url = "https://funder.example/call/123";
    const content = { text: "Original award title. Corrected award title.", links: [url, "http://funder.example/unsafe"] };
    const original = verifyExtraction({ title: "Original award title", url }, content, page, NOW);
    const corrected = verifyExtraction({ title: "Corrected award title", url }, content, page, NOW);
    if ("skip" in original || "skip" in corrected) throw new Error("Invalid test fixture");
    expect(original.external_id).toBe(corrected.external_id);
    expect(verifyExtraction({ title: "Original award title", url: page.url }, content, page, NOW)).toHaveProperty("skip");
    expect(verifyExtraction({ title: "Original award title", url: "http://funder.example/unsafe" }, content, page, NOW)).toHaveProperty("skip");
  });
  it("retains EU source metadata without inventing beneficiary eligibility", () => {
    const topic = json<{ results: EuResult[] }>("eu-search.json").results[0];
    const mapped = mapEuTopic(topic, NOW);
    if ("skip" in mapped) throw new Error(mapped.skip);
    expect(mapped.eligible_beneficiaries).toEqual([]);
    expect(mapped.beneficiary_notes).toContain("unknown");
    expect(mapped.raw.metadata).toEqual(topic.metadata);
  });
});
