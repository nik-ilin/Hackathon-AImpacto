// Canonical migration coverage replaces the retired standalone funding schema tests.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { mapBdnsDetail, type BdnsDetail } from "../src/sources/bdns.ts";
import { hashOpportunity } from "../src/pipeline.ts";
import type { RunState } from "../src/store/supabase.ts";
let db: PGlite;
const mapped = mapBdnsDetail(JSON.parse(readFileSync(new URL("./fixtures/bdns-detail-933468.json", import.meta.url), "utf8")) as BdnsDetail, new Date("2026-10-17T10:00:00Z"));
if ("skip" in mapped) throw new Error("Invalid fixture");
const item = { ...mapped, deadline_at: "2099-12-31T22:59:59Z", content_hash: hashOpportunity(mapped) };
const params = { sources: ["bdns"], sinceDays: 120, maxPerSource: 10 };
async function as<T>(role: "anon" | "authenticated" | "service_role", sql: string, values: unknown[] = []) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.role','${role}',false)`);
  try { return (await db.query<T>(sql, values)).rows; } finally { await db.exec("reset role"); }
}
const begin = async (key: string) => (await as<{ r: RunState }>("service_role", "select public.judy_begin_run($1,'test',$2::jsonb) r", [key, JSON.stringify(params)]))[0].r;
const upsert = async (state: RunState, data: unknown[], batch = "batch-0") => (await as<{ r: Record<string, unknown> }>("service_role", "select public.judy_upsert_opportunities($1,$2,$3,$4::jsonb) r", [state.run_id, state.lease_token, batch, JSON.stringify(data)]))[0].r;
const finish = async (state: RunState, errors: string[] = []) => (await as<{ r: RunState }>("service_role", "select public.judy_finish_run($1,$2,$3::jsonb) r", [state.run_id, state.lease_token, JSON.stringify({ stats: { bdns: { errors: errors.length } }, skipped: [], errors })]))[0].r;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;`);
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, migrations), "utf8"));
}, 60000);
afterAll(async () => { await db?.close(); });

describe("Judy canonical SQL / durable lease / idempotency (PGlite, not Auth/PostgREST)", () => {
  it("claims once, rejects concurrent distinct run/changed params, writes canonical identities/history/details and replays batches once", async () => {
    const first = await begin("judy-test-0001");
    expect(first.claimed).toBe(true);
    expect(await begin("judy-test-0001")).toMatchObject({ run_id: first.run_id, claimed: false, reused: true });
    await expect(begin("judy-test-0002")).rejects.toThrow("JUDY_BUSY");
    await expect(as("service_role", "select public.judy_begin_run('judy-test-0001','test','{}')")).rejects.toThrow("different parameters");
    expect(await upsert(first, [item])).toMatchObject({ created: 1, updated: 0, unchanged: 0, reused: false });
    expect(await upsert(first, [item])).toMatchObject({ created: 1, reused: true });
    await expect(upsert(first, [{ ...item, title: "Changed batch" }])).rejects.toThrow("different data");
    const completed = await finish(first);
    expect(completed).toMatchObject({ status: "completed", created: 1 });
    expect(await finish(first)).toMatchObject(completed);
    expect((await begin("judy-test-0001")).claimed).toBe(false);
    const second = await begin("judy-test-0002");
    expect(await upsert(second, [{ ...item, content_hash: "deliberately-untrusted-hash" }])).toMatchObject({ unchanged: 1 });
    await finish(second);
    const third = await begin("judy-test-0003");
    expect(await upsert(third, [{ ...item, title: item.title + " correction" }])).toMatchObject({ updated: 1 });
    await finish(third);
    const row = (await as<{ opportunity_type: string; content_version: number; eligible_beneficiaries: string[]; raw: unknown }>("authenticated", "select o.opportunity_type,o.content_version,d.eligible_beneficiaries,d.raw from public.opportunities o join public.funding_details d on d.opportunity_id=o.id where o.source_id='bdns' and o.external_id='933468'"))[0];
    expect(row.opportunity_type).toBe("research_funding");
    expect(row.content_version).toBe(2);
    expect(row.eligible_beneficiaries).toEqual(item.eligible_beneficiaries);
    expect(row.raw).toEqual(item.raw);
    expect((await db.query("select * from public.opportunity_versions where snapshot->>'external_id'='933468'")).rows).toHaveLength(2);
    expect((await db.query("select to_regclass('public.funding_opportunities') legacy")).rows[0]).toEqual({ legacy: null });
  });
  it("denies clients agent writes/run status and keeps server mutation permissions narrow", async () => {
    await expect(as("anon", "select public.judy_begin_run('client-key-1','cli','{}')")).rejects.toThrow("permission denied");
    await expect(as("authenticated", "select public.judy_get_run('judy-test-0001')")).rejects.toThrow("permission denied");
    await expect(as("authenticated", "update public.funding_details set currency='USD'")).rejects.toThrow("permission denied");
    await expect(as("anon", "select * from public.judy_runs")).rejects.toThrow("permission denied");
  });
  it("rejects insecure facts, wrong lease, expired owner and exposes partial/failed accurately", async () => {
    const state = await begin("judy-test-errors");
    await expect(upsert({ ...state, lease_token: "00000000-0000-4000-8000-000000000000" }, [item])).rejects.toThrow("lease");
    await expect(upsert(state, [{ ...item, external_id: "bad-http", url: "http://unsafe.example" }])).rejects.toThrow();
    await expect(upsert(state, [{ ...item, external_id: "bad-money", currency: null }])).rejects.toThrow();
    await upsert(state, [item]);
    expect((await finish(state, ["[bdns] partial source failure"])).status).toBe("partial");
    expect((await as("authenticated", "select * from public.opportunities where source_id='bdns'")).length).toBe(0);
    const stale = await begin("judy-test-expired");
    await db.query("update public.judy_runs set lease_until=now()-interval '1 minute' where id=$1", [stale.run_id]);
    expect(await begin("judy-test-expired")).toMatchObject({ claimed: false, status: "failed" });
    await expect(upsert(stale, [item])).rejects.toThrow("lease");
    const fresh = await begin("judy-test-new-request");
    expect((await finish(fresh, ["total source failure"])).status).toBe("failed");
  });
});
