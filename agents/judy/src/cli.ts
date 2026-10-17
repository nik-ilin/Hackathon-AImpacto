// Uso:
//   npm run collect -- [--sources bdns,eu_funding_tenders,ucm_otri,private_web] [--since-days 120]
//                      [--max 600] [--out ./data] [--dry-run]
// Sin --dry-run y con SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY definidos, guarda en Supabase.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createHttpClient } from "./util/http.ts";
import { ALL_SOURCES, collect, toCsv } from "./pipeline.ts";
import { saveToSupabase, supabaseConfigFromEnv } from "./store/supabase.ts";
import type { SourceId } from "./types.ts";

export function parseSources(value: string | undefined): SourceId[] {
  if (!value) return ALL_SOURCES;
  const aliases: Record<string, SourceId> = { eu: "eu_funding_tenders", ucm: "ucm_otri", private: "private_web" };
  const list = value.split(",").map((s) => s.trim()).filter(Boolean).map((s) => aliases[s] ?? s);
  const unknown = list.filter((s) => !(ALL_SOURCES as string[]).includes(s));
  if (unknown.length) throw new Error(`Fuentes desconocidas: ${unknown.join(", ")}. Válidas: ${ALL_SOURCES.join(", ")}`);
  return list as SourceId[];
}

async function main() {
  const { values } = parseArgs({
    options: {
      sources: { type: "string" },
      "since-days": { type: "string", default: "120" },
      max: { type: "string", default: "600" },
      out: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      trigger: { type: "string", default: "cli" },
    },
  });
  const sources = parseSources(values.sources);
  const http = createHttpClient({
    userAgent: process.env.JUDY_USER_AGENT,
    // APIs públicas documentadas (no páginas web): robots.txt no aplica.
    robotsExempt: ["www.infosubvenciones.es", "api.tech.ec.europa.eu"],
  });
  const report = await collect(
    http,
    { now: new Date(), sinceDays: Number(values["since-days"]), maxPerSource: Number(values.max) },
    sources,
    {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      llmModel: process.env.JUDY_LLM_MODEL,
      firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
      firecrawlUrl: process.env.FIRECRAWL_API_URL,
      firecrawlMaxAgeMs: process.env.FIRECRAWL_MAX_AGE_MS ? Number(process.env.FIRECRAWL_MAX_AGE_MS) : undefined,
    },
  );

  console.log(JSON.stringify({ stats: report.stats, total: report.items.length, http: http.stats }, null, 2));
  for (const error of report.errors) console.warn(`AVISO ${error}`);

  if (values.out) {
    mkdirSync(values.out, { recursive: true });
    writeFileSync(join(values.out, "opportunities.json"), JSON.stringify(report.items, null, 2));
    writeFileSync(join(values.out, "opportunities.csv"), toCsv(report.items));
    writeFileSync(join(values.out, "report.json"), JSON.stringify({ ...report, items: undefined }, null, 2));
    console.log(`Archivos escritos en ${values.out}`);
  }

  const supabase = supabaseConfigFromEnv();
  if (!values["dry-run"] && supabase) {
    const trigger = values.trigger === "make" || values.trigger === "schedule" ? values.trigger : "cli";
    const saved = await saveToSupabase(supabase, report, trigger);
    console.log(`Supabase: ${JSON.stringify(saved)}`);
  } else if (!values["dry-run"]) {
    console.log("Supabase no configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY): no se guarda en base de datos.");
  }
  // Fallo total: ninguna fuente devolvió datos y hubo errores.
  if (!report.items.length && report.errors.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
