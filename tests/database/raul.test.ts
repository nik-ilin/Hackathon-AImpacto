import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

let db: PGlite
async function service<T>(query: string, params: unknown[] = []) {
  await db.exec('set role service_role')
  try {
    await db.exec("select set_config('request.jwt.claim.role','service_role',false)")
    return (await db.query<T>(query, params)).rows
  } finally { await db.exec('reset role') }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;`)
  for (const file of readdirSync('supabase/migrations').filter(file => file.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'))
  await db.exec(`insert into public.opportunity_sources(id,name,official_url,terms_url,ingestion_method,
    frequency_hours,credits_per_check,status) values
    ('raul_test','Raul SQL test','https://example.org/official','https://example.org/terms','api',24,0,'active')`)
}, 30_000)
afterAll(async () => { await db?.close() })

const payload = {
  opportunity_type: 'scholarship', title: 'Official test scholarship', provider: 'Example University',
  summary: 'Verified source fact', official_url: 'https://example.org/official',
  application_url: null, bases_url: null, country: null, opens_at: null,
  official_deadline_date: '2026-12-31', official_deadline_at: null,
  internal_deadline_at: null, status: 'open', checked_at: '2026-10-17T12:00:00Z',
  provenance: { source_url: 'https://example.org/official', parser_version: 'test-1' },
  scholarship_details: {
    academic_stages: [], degree_areas: [], residence_requirement: { state: 'unknown', value: null },
    amount: { state: 'unknown', value: null }, requirements: [] as Record<string, unknown>[], missing_information: ['residence'],
  },
}

describe('Raúl SQL transaction, revisions and privileges (PGlite)', () => {
  it('local demo has three explicitly labeled official fixtures with future deadlines', async () => {
    const fixtures = await db.query<{ official_url: string; official_deadline_date: string }>(
      "select official_url,official_deadline_date::text from public.opportunities where provenance->>'seed_fixture'='true'")
    expect(fixtures.rows).toHaveLength(3)
    expect(fixtures.rows.every(row => row.official_url.startsWith('https://')
      && row.official_deadline_date > '2026-10-17')).toBe(true)
  })
  it('blocks client writes, reuses retry keys, rejects overlap and versions deadline changes', async () => {
    await db.exec('set role authenticated')
    try {
      await expect(db.query("select public.raul_begin_run('client-key-1','incremental',1)")).rejects.toThrow()
      await expect(db.query("update public.opportunity_sources set status='paused' where id='raul_test'")).rejects.toThrow()
    } finally { await db.exec('reset role') }

    const [first] = await service<{ raul_begin_run: { run_id: string; reused: boolean } }>(
      "select public.raul_begin_run('raul-key-0001','incremental',1)")
    const run1 = first.raul_begin_run.run_id
    expect(first.raul_begin_run.reused).toBe(false)
    expect((await service<{ raul_begin_run: { run_id: string; reused: boolean } }>(
      "select public.raul_begin_run('raul-key-0001','incremental',1)"))[0].raul_begin_run)
      .toMatchObject({ run_id: run1, reused: true })
    await expect(service("select public.raul_begin_run('raul-key-0002','incremental',1)"))
      .rejects.toThrow('RAUL_BUSY')

    async function upsert(runId: string, data: typeof payload, externalId = 'stable-id') {
      const rows = await service<{ raul_upsert_opportunity: { result: string; content_version: number } }>(
        'select public.raul_upsert_opportunity($1,$2,$3,$4::jsonb,$5,$6,$7)',
        [runId, 'raul_test', externalId, JSON.stringify(data), 10, 0, null])
      return rows[0].raul_upsert_opportunity
    }
    expect(await upsert(run1, payload)).toMatchObject({ result: 'created', content_version: 1 })
    await service('select public.raul_finish_run($1,$2)', [run1, 'completed'])

    const run2 = (await service<{ raul_begin_run: { run_id: string } }>(
      "select public.raul_begin_run('raul-key-0002','incremental',1)"))[0].raul_begin_run.run_id
    expect(await upsert(run2, payload)).toMatchObject({ result: 'unchanged', content_version: 1 })
    await service('select public.raul_finish_run($1,$2)', [run2, 'completed'])

    const run3 = (await service<{ raul_begin_run: { run_id: string } }>(
      "select public.raul_begin_run('raul-key-0003','incremental',1)"))[0].raul_begin_run.run_id
    expect(await upsert(run3, { ...payload, official_deadline_date: '2027-01-31' }))
      .toMatchObject({ result: 'updated', content_version: 2 })
    await expect(upsert(run3, { ...payload, scholarship_details: {
      ...payload.scholarship_details,
      requirements: [{ key: 'stage', label: 'Stage', state: 'confirmed', value: null,
        source_url: 'https://example.org/official' }],
    } }, 'invalid')).rejects.toThrow('Invalid requirement')
    await service('select public.raul_finish_run($1,$2)', [run3, 'completed'])
    const entries = await db.query<{ external_id: string; content_version: number; official_deadline_date: string }>(
      "select external_id,content_version,official_deadline_date::text from public.opportunities where source_id='raul_test'")
    expect(entries.rows).toHaveLength(1)
    expect(entries.rows[0]).toMatchObject({ external_id: 'stable-id', content_version: 2,
      official_deadline_date: '2027-01-31' })
    const versions = await db.query<{ count: number }>(
      "select count(*)::integer count from public.opportunity_versions v join public.opportunities o on o.id=v.opportunity_id where o.source_id='raul_test'")
    expect(versions.rows[0].count).toBe(2)
  })
})
