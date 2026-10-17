import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mapBdnsDetail, type BdnsDetail } from "../src/sources/bdns.ts";
import { hashOpportunity } from "../src/pipeline.ts";

let db: PGlite;
const NOW = new Date("2026-10-17T10:00:00Z");
const detail = JSON.parse(readFileSync(new URL("./fixtures/bdns-detail-933468.json", import.meta.url), "utf8")) as BdnsDetail;
const mapped = mapBdnsDetail(detail, NOW);
if ("skip" in mapped) throw new Error("fixture inválido");
const item = { ...mapped, content_hash: hashOpportunity(mapped) };

async function as<T>(role: "anon" | "authenticated" | "service_role", sql: string, params: unknown[] = []) {
  await db.exec(`set role ${role}`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;`);
  await db.exec(readFileSync(new URL("../sql/001_judy_funding_sources.sql", import.meta.url), "utf8"));
}, 60000);
afterAll(async () => { await db?.close(); });

describe("SQL de Judy (PGlite)", () => {
  it("upsert idempotente: alta, sin cambios y actualización por hash", async () => {
    const upsert = (items: unknown[]) => as<{ r: Record<string, number> }>("service_role", "select public.judy_upsert_opportunities($1::jsonb) r", [JSON.stringify(items)]);
    expect((await upsert([item]))[0].r).toEqual({ created: 1, updated: 0, unchanged: 0 });
    expect((await upsert([item]))[0].r).toEqual({ created: 0, updated: 0, unchanged: 1 });
    const changed = { ...item, title: `${item.title} (corrección)` };
    expect((await upsert([{ ...changed, content_hash: hashOpportunity(changed) }]))[0].r).toEqual({ created: 0, updated: 1, unchanged: 0 });
    const row = (await as<{ title: string; eligible_beneficiaries: string[]; regions: string[] }>("anon", "select title, eligible_beneficiaries, regions from public.funding_opportunities where external_id = '933468'"))[0];
    expect(row.title).toContain("(corrección)");
    expect(row.eligible_beneficiaries).toEqual(["individual"]);
    expect(row.regions).toEqual(["ES22 - COMUNIDAD FORAL DE NAVARRA"]);
  });

  it("la vista recalcula el estado con la hora actual", async () => {
    const rows = await as<{ live_status: string }>("anon", "select live_status from public.funding_opportunities_live where external_id = '933468'");
    // El plazo del fixture (3/11/2026) puede haber pasado cuando se ejecute el test: se comprueba la coherencia, no un valor fijo.
    expect(rows[0].live_status).toBe(new Date() > new Date("2026-11-03T22:59:59Z") ? "closed" : "open");
  });

  it("lectura pública; escritura y registro de ejecuciones solo con la clave de servicio", async () => {
    expect((await as("authenticated", "select id from public.funding_opportunities")).length).toBe(1);
    await expect(as("anon", "select public.judy_upsert_opportunities('[]'::jsonb)")).rejects.toThrow("permission denied");
    await expect(as("authenticated", "insert into public.funding_opportunities(source) values ('bdns')")).rejects.toThrow("permission denied");
    await expect(as("anon", "select * from public.judy_runs")).rejects.toThrow("permission denied");
    const run = await as<{ id: string }>("service_role", "select public.judy_record_run($1::jsonb) id", [JSON.stringify({ trigger: "test", started_at: NOW.toISOString(), finished_at: NOW.toISOString(), stats: { bdns: 1 } })]);
    expect(run[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("las restricciones rechazan datos incoherentes", async () => {
    const bad = { ...item, external_id: "x1", url: "http://inseguro.es", content_hash: "a".repeat(64) };
    await expect(as("service_role", "select public.judy_upsert_opportunities($1::jsonb)", [JSON.stringify([bad])])).rejects.toThrow();
    const noCurrency = { ...item, external_id: "x2", currency: null };
    await expect(as("service_role", "select public.judy_upsert_opportunities($1::jsonb)", [JSON.stringify([noCurrency])])).rejects.toThrow();
  });
});
