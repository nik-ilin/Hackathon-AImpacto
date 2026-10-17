import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

let db: PGlite
async function service<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  await db.exec("set role service_role; select set_config('request.jwt.claim.role','service_role',false)")
  try { return (await db.query<T>(sql, params)).rows } finally { await db.exec('reset role') }
}
const item = {
  source: 'bdns', external_id: 'funding-stable-1', funder_name: 'Research Ministry', funder_type: 'public',
  title: 'Factual research funding call', summary: 'Official research funding facts', url: 'https://example.org/call',
  bases_url: 'https://example.org/bases', source_url: 'https://example.org/source', programme: 'Programme one',
  call_identifier: 'CALL-1', instrument: 'Grant', scope: 'national', regions: ['Madrid'],
  eligible_beneficiaries: ['university'], beneficiary_notes: 'Institutional applicants; individual eligibility unknown',
  currency: 'EUR', total_budget: 3000000, min_amount: 1000, max_amount: 100000, expected_grants: 50,
  opens_at: null, deadline_at: '2035-12-31T23:59:59Z', deadline_text: null, internal_deadline_at: null,
  status: 'open', keywords: ['Research'], language: 'es', raw: { official: true }, content_hash: 'a'.repeat(64),
}
type Run = { run_id: string; lease_token: string; status: string; claimed: boolean; reused: boolean }
async function begin(key: string) {
  return (await service<{ result: Run }>('select public.judy_begin_run($1,$2,$3::jsonb) result',
    [key, 'test', JSON.stringify({ sources: ['bdns'] })]))[0].result
}
async function ingest(run: Run, values: unknown[] = [item], batch = 'batch-0') {
  return (await service<{ result: { created: number; updated: number; unchanged: number; reused: boolean } }>(
    'select public.judy_upsert_opportunities($1,$2,$3,$4::jsonb) result',
    [run.run_id, run.lease_token, batch, JSON.stringify(values)]))[0].result
}
async function finish(run: Run, errors: string[] = []) {
  return (await service<{ result: { status: string; created: number } }>(
    'select public.judy_finish_run($1,$2,$3::jsonb) result', [run.run_id, run.lease_token,
      JSON.stringify({ stats: { bdns: { errors: errors.length } }, errors, skipped: [] })]))[0].result
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;`)
  await db.exec(`create function public.rls_auto_enable() returns event_trigger
    language plpgsql security definer set search_path=pg_catalog as $$ begin null; end; $$`)
  for (const file of readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }
}, 30_000)
afterAll(async () => { await db?.close() })

describe('canonical funding catalog transactional persistence', () => {
  it('restricts catalog writes, run data and service RPCs to backend role', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await expect(db.query("select public.judy_begin_run('client-request','test','{}')")).rejects.toThrow('permission denied')
        await expect(db.query('select * from public.judy_runs')).rejects.toThrow('permission denied')
        await expect(db.query("insert into public.funding_details(opportunity_id,funder_type,source_url,scope) values(gen_random_uuid(),'public','https://example.org','national')")).rejects.toThrow('permission denied')
      } finally { await db.exec('reset role') }
    }
    expect((await db.query<{ count: number }>("select count(*)::integer count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.prorettype<>'event_trigger'::regtype")).rows[0].count).toBe(0)
    expect((await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','public.rls_auto_enable()','execute') allowed")).rows[0].allowed).toBe(false)
  })
  it('uses stable identity, server factual hashes, complete metadata and replay-safe batch accounting', async () => {
    const run = await begin('judy-catalog-0001')
    expect(await begin('judy-catalog-0001')).toMatchObject({ run_id: run.run_id, reused: true, claimed: false })
    await expect(begin('judy-catalog-busy')).rejects.toThrow('JUDY_BUSY')
    expect(await ingest(run)).toMatchObject({ created: 1, updated: 0, unchanged: 0, reused: false })
    expect(await ingest(run)).toMatchObject({ created: 1, reused: true })
    await expect(ingest(run, [{ ...item, title: 'Different data' }])).rejects.toThrow('Batch key reused')
    const row = (await db.query<{ content_hash: string; content_version: number; programme: string; total_budget: number; raw: unknown }>(
      "select o.content_hash,o.content_version,d.programme,d.total_budget::float8 total_budget,d.raw from public.opportunities o join public.funding_details d on d.opportunity_id=o.id where source_id='bdns' and external_id=$1", [item.external_id])).rows[0]
    expect(row).toMatchObject({ content_version: 1, programme: item.programme, total_budget: item.total_budget, raw: item.raw })
    expect(row.content_hash).not.toBe(item.content_hash)
    expect(await finish(run)).toMatchObject({ status: 'completed', created: 1 })
    expect(await finish(run)).toMatchObject({ status: 'completed', created: 1 })
  })
  it('updates real fact changes only; raw body, submitted hash and temporal status do not version facts', async () => {
    const run = await begin('judy-catalog-0002')
    expect(await ingest(run, [{ ...item, raw: { audit: 'new' }, content_hash: 'b'.repeat(64), status: 'forthcoming' }]))
      .toMatchObject({ unchanged: 1 })
    await finish(run)
    const changed = await begin('judy-catalog-0003')
    expect(await ingest(changed, [{ ...item, deadline_at: '2036-01-31T00:00:00Z' }])).toMatchObject({ updated: 1 })
    await finish(changed)
    expect((await db.query<{ count: number }>("select count(*)::integer count from public.opportunity_versions v join public.opportunities o on o.id=v.opportunity_id where source_id='bdns'")).rows[0].count).toBe(2)
    expect((await db.query<{ count: number }>("select count(*)::integer count from public.scholarship_details d join public.opportunities o on o.id=d.opportunity_id where source_id='bdns'")).rows[0].count).toBe(0)
  })
  it('rolls back a malformed batch completely and rejects invalid money constraints', async () => {
    const run = await begin('judy-catalog-0004')
    await expect(ingest(run, [{ ...item, external_id: 'must-rollback' }, { ...item, external_id: 'invalid', min_amount: 999999, max_amount: 1 }]))
      .rejects.toThrow()
    expect((await db.query<{ count: number }>("select count(*)::integer count from public.opportunities where external_id in ('must-rollback','invalid')")).rows[0].count).toBe(0)
    expect(await finish(run, ['SOURCE_ERROR'])).toMatchObject({ status: 'failed', created: 0 })
  })
  it('records partial durable outcomes, fences expired owners and never restarts the same request', async () => {
    const run = await begin('judy-catalog-0005')
    await ingest(run)
    await db.query("update public.judy_runs set lease_until=now()-interval '1 second' where id=$1", [run.run_id])
    await expect(ingest(run, [item], 'batch-late')).rejects.toThrow('Run lease is not active')
    const replay = await begin('judy-catalog-0005')
    expect(replay).toMatchObject({ status: 'partial', claimed: false, reused: true })
    expect(replay).not.toHaveProperty('lease_token')
    const durable = (await service<{ result: { errors: string[] } }>("select public.judy_get_run('judy-catalog-0005') result"))[0].result
    expect(durable.errors).toContain('LEASE_EXPIRED')
    await expect(service('select public.judy_renew_run($1,$2)', [run.run_id, run.lease_token])).rejects.toThrow('Run lease is not active')
  })
  it('RLS hides paused/error sources, stale/future checks and closed deadlines', async () => {
    const run = await begin('judy-catalog-0006')
    await ingest(run)
    await finish(run)
    async function visible() {
      await db.exec('set role authenticated')
      try { return (await db.query<{ count: number }>("select count(*)::integer count from public.opportunities where source_id='bdns'")).rows[0].count }
      finally { await db.exec('reset role') }
    }
    expect(await visible()).toBe(1)
    await db.exec("update public.opportunity_sources set status='paused' where id='bdns'")
    expect(await visible()).toBe(0)
    await db.exec("update public.opportunity_sources set status='active' where id='bdns'; update public.opportunities set checked_at=now()-interval '15 days' where source_id='bdns'")
    expect(await visible()).toBe(0)
    await db.exec("update public.opportunities set checked_at=now()+interval '1 day' where source_id='bdns'")
    expect(await visible()).toBe(0)
    await db.exec("update public.opportunities set checked_at=now(),official_deadline_at=now()-interval '1 hour' where source_id='bdns'")
    expect(await visible()).toBe(0)
  })
  it('Raul expired runs settle durably and source accounting cannot be written afterward', async () => {
    const run = (await service<{ result: { run_id: string } }>("select public.raul_begin_run('raul-expire-0001','incremental',1) result"))[0].result
    await db.query("update public.raul_runs set lease_until=now()-interval '1 second' where id=$1", [run.run_id])
    expect((await service<{ result: { status: string; error_codes: string[] } }>('select public.raul_expire_run($1) result', [run.run_id]))[0].result)
      .toMatchObject({ status: 'failed', error_codes: ['LEASE_EXPIRED'] })
    await expect(service("select public.raul_record_source_result($1,'bdns','failed',0,0,0,0,'TIMEOUT',0,null,1)", [run.run_id]))
      .rejects.toThrow('Run is not active')
  })
  it('Raul finalization persists all source accounting and fences subsequent source writes', async () => {
    const run = (await service<{ result: { run_id: string } }>("select public.raul_begin_run('raul-finish-0001','incremental',2) result"))[0].result
    await service("select public.raul_record_source_result($1,'bdns','completed',0,0,0,2,null,1,0.75,10)", [run.run_id])
    await service("select public.raul_record_source_result($1,'eu_funding_tenders','failed',0,0,0,0,'SOURCE_TIMEOUT',0.5,null,20)", [run.run_id])
    const summary = (await service<{ result: Record<string, unknown> }>(
      "select public.raul_finish_run($1,'partial') result", [run.run_id]))[0].result
    expect(summary).toMatchObject({ status: 'partial', sources_reviewed: 2, created: 0, updated: 0,
      unchanged: 0, discarded: 2, errors: 1, credits_estimated: 1.5, credits_measured: 0.75 })
    const persisted = (await db.query<{ status: string; discarded_count: number; error_count: number; error_codes: string[] }>(
      'select status,discarded_count,error_count,error_codes from public.raul_runs where id=$1', [run.run_id])).rows[0]
    expect(persisted).toMatchObject({ status: 'partial', discarded_count: 2, error_count: 1, error_codes: ['SOURCE_TIMEOUT'] })
    await expect(service("select public.raul_record_source_result($1,'bdns','failed',0,0,0,0,'LATE_SOURCE',0,null,1)", [run.run_id]))
      .rejects.toThrow('Run is not active')
  })
})

