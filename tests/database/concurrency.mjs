import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

// Local test database only. Never accepts a remote connection string.
const connectionString = process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const url = new URL(connectionString)
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
  throw new Error('Concurrency tests require a loopback LOCAL_DATABASE_URL and an isolated local Supabase database.')
}
const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 15000 }))
const [setup, first, second] = clients
try {
  await Promise.all(clients.map(client => client.connect()))
  const [owner, applicant, group] = [randomUUID(), randomUUID(), randomUUID()]
  await setup.query('insert into auth.users(id) values($1),($2)', [owner, applicant])
  await setup.query("insert into public.profiles(id,full_name) values($1,'Concurrency owner'),($2,'Concurrency applicant')", [owner, applicant])
  await setup.query("insert into public.research_groups(id,owner_id,name,visibility,accepting_members) values($1,$2,'Concurrency fixture','public',true)", [group, owner])
  await setup.query('set role authenticated')
  await setup.query("select set_config('request.jwt.claim.sub',$1,false)", [applicant])
  const requested = await setup.query('select * from public.request_to_join($1,null)', [group])
  const request = requested.rows[0].id
  await setup.query('reset role')
  const pids = []
  for (const client of [first, second]) {
    pids.push((await client.query('select pg_backend_pid() pid')).rows[0].pid)
    await client.query('set role authenticated')
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
  }
  // A third connection holds the group lock until BOTH real sessions are waiting.
  await setup.query('begin')
  await setup.query('select id from public.research_groups where id=$1 for update', [group])
  const decisions = [first, second].map(client => client.query("select * from public.decide_join_request($1,'approved')", [request]))
  const pending = Promise.all(decisions)
  // Attach a rejection handler immediately so connection failures are never unhandled.
  pending.catch(() => {})
  let waiting = 0
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    waiting = Number((await setup.query("select count(*) n from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [pids])).rows[0].n)
    if (waiting === 2) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.equal(waiting, 2, 'both concurrent database sessions must wait on the lock')
  await setup.query('commit')
  const results = await pending
  assert.ok(results.every(result => result.rows[0].status === 'approved'))
  const members = await setup.query('select count(*) n from public.group_memberships where group_id=$1 and user_id=$2', [group, applicant])
  assert.equal(Number(members.rows[0].n), 1)
  const state = await setup.query('select status,decided_by from public.group_join_requests where id=$1', [request])
  assert.equal(state.rows[0].status, 'approved')
  assert.equal(state.rows[0].decided_by, owner)
  console.log('PASS: two PostgreSQL sessions approved concurrently; one membership; one coherent approved request.')
} finally {
  await setup.query('rollback').catch(() => {})
  await Promise.all(clients.map(client => client.end().catch(() => {})))
}
