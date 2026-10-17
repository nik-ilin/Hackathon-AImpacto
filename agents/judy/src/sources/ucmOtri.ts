// Fuente privada (agregador): página de convocatorias privadas de la OTRI/OTC de la UCM.
// Resume convocatorias de fundaciones ("la Caixa", AECC, Ramón Areces, MAPFRE…) con enlace a la fuente oficial.
// Judy guarda el enlace oficial como url y la página de la UCM como source_url.
import * as cheerio from "cheerio";
import type { HttpClient } from "../util/http.ts";
import type { Beneficiary, CollectOptions, FundingOpportunity, SourceResult } from "../types.ts";
import { asHttpsUrl, computeStatus, contentHash, findSpanishDate, truncate } from "../util/text.ts";

export const UCM_OTRI_URL = "https://www.ucm.es/otri/financiacion-convocatorias-privadas";

export async function collectUcmOtri(http: HttpClient, options: CollectOptions, url = UCM_OTRI_URL): Promise<SourceResult> {
  const result: SourceResult = { source: "ucm_otri", items: [], skipped: [], errors: [] };
  try {
    const html = await http.getText(url);
    const parsed = parseUcmOtri(html, url, options.now);
    result.items.push(...parsed.items.slice(0, options.maxPerSource));
    result.skipped.push(...parsed.skipped);
  } catch (error) {
    result.errors.push(`Página OTRI UCM: ${String(error)}`);
  }
  return result;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

export function parseUcmOtri(html: string, pageUrl: string, now: Date) {
  const $ = cheerio.load(html);
  const items: FundingOpportunity[] = [];
  const skipped: { id: string; reason: string }[] = [];

  $(".convocatoria-card").each((_, element) => {
    const card = $(element);
    const category = clean(card.children("h2").first().text());
    const title = clean(card.children("h6.cat").first().text());
    const field = (label: string) => {
      const p = card.children("p").filter((__, el) => $(el).find("strong").first().text().toLowerCase().startsWith(label));
      return clean(p.first().text().replace(/^[^:]*:\s*/, ""));
    };
    const funder = field("entidad financiadora");
    if (!title || !funder) {
      skipped.push({ id: title || "(sin título)", reason: "Tarjeta sin título o sin entidad financiadora" });
      return;
    }
    const state = clean(card.find(".meta").text());
    const summary = field("resumen");
    const internalDeadline = findSpanishDate(field("plazo otc"));

    // Secciones dentro de "Más información": el plazo oficial va tras el título "Plazo del organismo".
    const sectionText = (heading: string) => {
      const h = card.find("details h6").filter((__, el) => $(el).text().toLowerCase().includes(heading)).first();
      return clean(h.nextUntil("h6").text());
    };
    const officialDeadlineText = sectionText("plazo del organismo");
    const deadlineAt = findSpanishDate(officialDeadlineText);
    const requirements = sectionText("requisitos");

    const links = card.find("a[href]").map((__, a) => $(a).attr("href") ?? "").get()
      .map((href) => asHttpsUrl(href.startsWith("http") ? href : null))
      .filter((href): href is string => Boolean(href));
    const external = links.filter((href) => !/ucm\.es/i.test(href) && !/login|s_login|smartsimple/i.test(href));
    const official = external.find((href) => !/\.pdf($|\?)/i.test(href)) ?? external[0] ?? null;
    const bases = [...external, ...links].find((href) => /\.pdf($|\?)|bases|rules/i.test(href)) ?? null;
    if (!official) {
      skipped.push({ id: title, reason: "No stable official URL; listing title is not an identity" });
      return;
    }

    const closedOnPage = /cerrad/i.test(state);
    const status = closedOnPage ? "closed" : computeStatus(null, deadlineAt, now);
    items.push({
      source: "ucm_otri",
      external_id: contentHash(official),
      funder_name: funder.replace(/[”“"]/g, '"'),
      funder_type: "private",
      title,
      summary: truncate([summary, requirements].filter(Boolean).join("\n\n"), 4000),
      url: official,
      bases_url: bases,
      source_url: pageUrl,
      programme: null,
      call_identifier: null,
      instrument: category || null,
      scope: "national",
      regions: [],
      eligible_beneficiaries: beneficiariesFromCategory(category, requirements),
      beneficiary_notes: truncate(requirements, 1500),
      currency: null,
      total_budget: null,
      min_amount: null,
      max_amount: null,
      expected_grants: null,
      opens_at: null,
      deadline_at: deadlineAt,
      deadline_text: officialDeadlineText ? truncate(officialDeadlineText, 300) : null,
      internal_deadline_at: internalDeadline,
      status,
      keywords: [category].filter(Boolean),
      language: "es",
      raw: { estado_en_pagina: state, plazo_otc: field("plazo otc"), official_deadline_text: officialDeadlineText, requirements, summary, category, official_url: official, aggregator: "OTRI/OTC Universidad Complutense de Madrid" },
    });
  });
  return { items, skipped };
}

function beneficiariesFromCategory(category: string, requirements: string): Beneficiary[] {
  const text = `${category} ${requirements}`.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const out = new Set<Beneficiary>();
  if (/contratos? (pre|post)doctoral|persona solicitante|personal investigador/.test(text)) out.add("individual");
  // Broad words such as "project" or "organization" do not establish a beneficiary type.
  if (/universidad/.test(text)) out.add("university");
  if (/centros? de investigacion/.test(text)) out.add("research_center");
  if (/sin animo de lucro/.test(text)) out.add("nonprofit");
  if (/hospital/.test(text)) out.add("hospital");
  if (/empresas?/.test(text)) out.add("company");
  return [...out];
}
