import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

// PostgreSQL sessions are deliberately independent; PGlite cannot replace this test.
const connectionString = process.env.LOCAL_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const endpoint = new URL(connectionString);
if (!["postgres:", "postgresql:"].includes(endpoint.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
  throw new Error("Catalog concurrency tests require an isolated loopback PostgreSQL database.");
}
const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 15000 }));
const [setup, first, second] = clients;
const fixture = randomUUID();
const report = { stats: { bdns: { errors: 0 } }, errors: [], skipped: [] };
const item = {
  source: "bdns", external_id: `race-${fixture}`, funder_name: "Local concurrency funder", funder_type: "public",
  title: "Local concurrent funding fixture", summary: "Not a real funding call", url: "https://example.invalid/call",
  source_url: "https://example.invalid/source", scope: "national", regions: [], eligible_beneficiaries: [],
  beneficiary_notes: "Unknown individual eligibility", currency: null, total_budget: null, min_amount: null, max_amount: null,
  expected_grants: null, deadline_at: null, status: "open", keywords: [], language: "es", raw: { fixture: true },
};
const jsonQuery = async (client, sql, params) => (await client.query(sql, params)).rows[0].result;
const begin = (client, suffix) => jsonQuery(client, "select public.judy_begin_run($1,'test',$2::jsonb) result", [`concurrency-${fixture}-${suffix}`, JSON.stringify({ sources: ["bdns"], fixture })]);
const ingest = (client, run, batch, values) => jsonQuery(client, "select public.judy_upsert_opportunities($1,$2,$3,$4::jsonb) result", [run.run_id, run.lease_token, batch, JSON.stringify(values)]);
const finish = (client, run) => jsonQuery(client, "select public.judy_finish_run($1,$2,$3::jsonb) result", [run.run_id, run.lease_token, JSON.stringify(report)]);
let source;
let pids;
let activeRun;
let raulRun;
async function waitForLocks(expected) {
  const deadline = Date.now() + 5000;
  let waiting = 0;
  while (Date.now() < deadline) {
    waiting = Number((await setup.query("select count(*) n from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [pids])).rows[0].n);
    if (waiting === expected) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(waiting, expected, "Independent sessions must actually overlap and wait on the database lock");
}
async function race(lockSql, lockParams, jobA, jobB) {
  await setup.query("begin");
  try {
    await setup.query(lockSql, lockParams);
    const pendingA = jobA();
    pendingA.catch(() => {});
    await waitForLocks(1);
    const pendingB = jobB();
    pendingB.catch(() => {});
    await waitForLocks(2);
    await setup.query("commit");
    return await Promise.allSettled([pendingA, pendingB]);
  } catch (error) {
    await setup.query("rollback");
    throw error;
  }
}
const fulfilled = result => {
  if (result.status === "rejected") throw result.reason;
  return result.value;
};
try {
  await Promise.all(clients.map(client => client.connect()));
  pids = await Promise.all([first, second].map(async client => {
    const pid = (await client.query("select pg_backend_pid() pid")).rows[0].pid;
    await client.query("set role service_role");
    await client.query("select set_config('request.jwt.claim.role','service_role',false)");
    return pid;
  }));
  assert.notEqual(pids[0], pids[1], "Concurrency requires two separate PostgreSQL connections");
  source = (await setup.query("select status,last_reviewed_at from public.opportunity_sources where id='bdns'")).rows[0];
  assert.ok(source, "Apply local migrations before the concurrency test");
  await setup.query("update public.opportunity_sources set status='active' where id='bdns'");

  const begins = (await race("select pg_advisory_xact_lock(hashtextextended('nexolab:judy:run',0))", [], () => begin(first, "claim"), () => begin(second, "claim"))).map(fulfilled);
  assert.equal(begins.filter(value => value.claimed).length, 1, "Exactly one caller owns the run lease");
  activeRun = begins.find(value => value.claimed);
  const retry = begins.find(value => !value.claimed);
  assert.equal(retry.run_id, activeRun.run_id);
  assert.equal(Object.hasOwn(retry, "lease_token"), false, "The losing retry must never receive a lease");

  const sameIdentity = (await race("select id from public.judy_runs where id=$1 for update", [activeRun.run_id], () => ingest(first, activeRun, "identity-a", [item]), () => ingest(second, activeRun, "identity-b", [item]))).map(fulfilled);
  assert.equal(sameIdentity.reduce((sum, value) => sum + value.created, 0), 1);
  assert.equal(sameIdentity.reduce((sum, value) => sum + value.unchanged, 0), 1);
  let persisted = (await setup.query("select id,content_version from public.opportunities where source_id='bdns' and external_id=$1", [item.external_id])).rows;
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].content_version, 1);
  assert.equal(Number((await setup.query("select count(*) n from public.opportunity_versions where opportunity_id=$1", [persisted[0].id])).rows[0].n), 1);

  const replayItem = { ...item, external_id: `${item.external_id}-batch` };
  const sameBatch = (await race("select id from public.judy_runs where id=$1 for update", [activeRun.run_id], () => ingest(first, activeRun, "same-batch", [replayItem]), () => ingest(second, activeRun, "same-batch", [replayItem]))).map(fulfilled);
  assert.equal(sameBatch.filter(value => value.reused).length, 1);
  assert.equal(sameBatch.filter(value => !value.reused).length, 1);
  let counters = (await setup.query("select created_count,unchanged_count from public.judy_runs where id=$1", [activeRun.run_id])).rows[0];
  assert.equal(counters.created_count, 2, "Duplicate batch is accounted once");
  assert.equal(counters.unchanged_count, 1);

  const beforeFinish = { ...item, external_id: `${item.external_id}-before-finish` };
  const ingestFirst = (await race("select id from public.judy_runs where id=$1 for update", [activeRun.run_id], () => ingest(first, activeRun, "before-finish", [beforeFinish]), () => finish(second, activeRun))).map(fulfilled);
  assert.equal(ingestFirst[0].created, 1);
  assert.equal(ingestFirst[1].status, "completed");
  assert.equal(ingestFirst[1].created, 3, "Finalization sees the earlier committed ingestion");
  activeRun = undefined;

  activeRun = await begin(first, "finish-first");
  const afterFinish = { ...item, external_id: `${item.external_id}-after-finish` };
  const finishFirst = await race("select id from public.judy_runs where id=$1 for update", [activeRun.run_id], () => finish(first, activeRun), () => ingest(second, activeRun, "after-finish", [afterFinish]));
  assert.equal(fulfilled(finishFirst[0]).status, "completed");
  assert.equal(finishFirst[1].status, "rejected", "Ingestion after finalization must fail");
  assert.equal(finishFirst[1].reason.code, "22023");
  persisted = (await setup.query("select id from public.opportunities where source_id='bdns' and external_id=$1", [afterFinish.external_id])).rows;
  assert.equal(persisted.length, 0, "Rejected late ingestion creates neither facts nor history");
  assert.equal(Number((await setup.query("select count(*) n from public.judy_run_batches where run_id=$1", [activeRun.run_id])).rows[0].n), 0);
  activeRun = undefined;

  const scholarship = {
    opportunity_type: "scholarship", title: "Local conflicting scholarship fixture", provider: "Local university",
    summary: "Not real", official_url: "https://example.invalid/scholarship", official_deadline_date: "2099-12-31",
    checked_at: new Date().toISOString(), status: "open", provenance: { source_url: "https://example.invalid/source", parser_version: "local-test" },
    scholarship_details: { academic_stages: [], degree_areas: [], residence_requirement: { state: "unknown", value: null }, amount: { state: "unknown", value: null }, requirements: [], missing_information: ["Eligibility not available"] },
  };
  // Both Ra?l orderings must use a fresh statement snapshot after acquiring the run lock.
  raulRun = await jsonQuery(first, "select public.raul_begin_run($1,'incremental',1) result", [`raul-ingest-first-${fixture}`]);
  const raulBeforeFinishId = `${item.external_id}-raul-before-finish`;
  const raulIngestFirst = (await race("select id from public.raul_runs where id=$1 for update", [raulRun.run_id],
    () => jsonQuery(first, "select public.raul_upsert_opportunity($1,'bdns',$2,$3::jsonb,10,1,0.75) result", [raulRun.run_id, raulBeforeFinishId, JSON.stringify(scholarship)]),
    () => jsonQuery(second, "select public.raul_finish_run($1,'completed') result", [raulRun.run_id]))).map(fulfilled);
  assert.equal(raulIngestFirst[0].result, "created");
  assert.equal(raulIngestFirst[1].status, "completed");
  assert.equal(raulIngestFirst[1].sources_reviewed, 1, "Ra?l finalization sees the earlier committed source result");
  assert.equal(raulIngestFirst[1].created, 1, "Ra?l aggregates include ingestion committed while finalization waited");
  assert.equal(raulIngestFirst[1].credits_estimated, 1);
  assert.equal(raulIngestFirst[1].credits_measured, 0.75);
  const raulPersisted = (await setup.query("select status,sources_reviewed,created_count from public.raul_runs where id=$1", [raulRun.run_id])).rows[0];
  assert.equal(raulPersisted.status, "completed");
  assert.equal(raulPersisted.sources_reviewed, 1);
  assert.equal(raulPersisted.created_count, 1);
  raulRun = undefined;

  raulRun = await jsonQuery(first, "select public.raul_begin_run($1,'incremental',1) result", [`raul-finish-first-${fixture}`]);
  const raulAfterFinishId = `${item.external_id}-raul-after-finish`;
  const raulFinishFirst = await race("select id from public.raul_runs where id=$1 for update", [raulRun.run_id],
    () => jsonQuery(first, "select public.raul_finish_run($1,'completed') result", [raulRun.run_id]),
    () => jsonQuery(second, "select public.raul_upsert_opportunity($1,'bdns',$2,$3::jsonb,10,1,0.75) result", [raulRun.run_id, raulAfterFinishId, JSON.stringify(scholarship)]));
  assert.equal(fulfilled(raulFinishFirst[0]).status, "completed");
  assert.equal(raulFinishFirst[1].status, "rejected", "Ra?l ingestion cannot append to a finalized run");
  assert.equal(raulFinishFirst[1].reason.code, "22023");
  assert.equal(Number((await setup.query("select count(*) n from public.opportunities where source_id='bdns' and external_id=$1", [raulAfterFinishId])).rows[0].n), 0);
  assert.equal(Number((await setup.query("select count(*) n from public.raul_source_runs where run_id=$1", [raulRun.run_id])).rows[0].n), 0);
  raulRun = undefined;

  // Judy and Raúl lock the same canonical identity even though their run rows differ.
  activeRun = await begin(first, "cross-collector");
  raulRun = await jsonQuery(second, "select public.raul_begin_run($1,'incremental',1) result", [`raul-concurrency-${fixture}`]);
  const shared = { ...item, external_id: `${item.external_id}-shared` };
  const cross = await race("select pg_advisory_xact_lock(hashtextextended('nexolab:opportunity:bdns:'||$1,0))", [shared.external_id],
    () => ingest(first, activeRun, "shared-identity", [shared]),
    () => jsonQuery(second, "select public.raul_upsert_opportunity($1,'bdns',$2,$3::jsonb,0,0,null) result", [raulRun.run_id, shared.external_id, JSON.stringify(scholarship)]));
  assert.equal(fulfilled(cross[0]).created, 1);
  assert.equal(cross[1].status, "rejected", "A second collector cannot overwrite another catalog type");
  assert.equal(cross[1].reason.code, "22023");
  const sharedRow = (await setup.query("select id,opportunity_type,content_version from public.opportunities where source_id='bdns' and external_id=$1", [shared.external_id])).rows;
  assert.equal(sharedRow.length, 1);
  assert.equal(sharedRow[0].opportunity_type, "research_funding");
  assert.equal(sharedRow[0].content_version, 1);
  assert.equal(Number((await setup.query("select count(*) n from public.scholarship_details where opportunity_id=$1", [sharedRow[0].id])).rows[0].n), 0);
  assert.equal(Number((await setup.query("select count(*) n from public.raul_source_runs where run_id=$1", [raulRun.run_id])).rows[0].n), 0, "Rejected collector rolls back run accounting");
  await finish(first, activeRun);
  activeRun = undefined;
  await jsonQuery(second, "select public.raul_fail_run($1,'LOCAL_IDENTITY_CONFLICT') result", [raulRun.run_id]);
  raulRun = undefined;
  console.log("PASS: independent PostgreSQL sessions overlap on real locks; one run owner, one canonical identity/version, replay-safe batch counts, both Judy and Ra?l ingest/finalize orderings and cross-collector type fencing.");
} finally {
  await setup.query("rollback").catch(() => {});
  if (activeRun) await finish(first, activeRun).catch(() => {});
  if (raulRun) await jsonQuery(second, "select public.raul_fail_run($1,'LOCAL_TEST_ABORTED') result", [raulRun.run_id]).catch(() => {});
  if (source) await setup.query("update public.opportunity_sources set status=$1,last_reviewed_at=$2 where id='bdns'", [source.status, source.last_reviewed_at]);
  await Promise.all(clients.map(client => client.end().catch(() => {})));
}
