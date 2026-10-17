import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localServiceConfig } from "./local-service-config.mjs";
import { beginRun as adapterBeginRun, getRun as adapterGetRun, saveToSupabase } from "../../agents/judy/src/store/supabase.ts";

// No external source is contacted. Every fact below is an isolated local fixture.
const { url, key, serviceKey } = localServiceConfig();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, serviceKey, options);
const anon = createClient(url, key, options);
const user = createClient(url, key, options);
const fixture = randomUUID();
const report = { stats: { bdns: { errors: 0 } }, errors: [], skipped: [] };
const check = async (operation, label) => {
  const { data, error } = await operation;
  // Do not dump request objects, session objects, keys or headers on failure.
  if (error) throw new Error(`${label}: ${error.code ?? "UNKNOWN"} ${error.message}`);
  return data;
};
const deny = async (operation, label) => {
  const result = await operation;
  assert.ok(result.error, label);
};
const item = {
  source: "bdns", external_id: `backend-${fixture}`, funder_name: "Local test funder", funder_type: "public",
  title: "Local factual research funding", summary: "Local fixture; not a real call", url: "https://example.invalid/call",
  source_url: "https://example.invalid/source", bases_url: "https://example.invalid/bases", programme: "Fixture programme",
  call_identifier: "LOCAL-CALL", instrument: "Grant", scope: "national", regions: ["Madrid"],
  eligible_beneficiaries: ["university"], beneficiary_notes: "Personal eligibility has not been evaluated",
  currency: null, total_budget: null, min_amount: null, max_amount: null, expected_grants: null,
  opens_at: null, deadline_at: null, deadline_text: "Not specified in this fixture", internal_deadline_at: null,
  status: "open", keywords: ["Research"], language: "es", raw: { local_fixture: true }, content_hash: "0".repeat(64),
};
const unknown = { ...item, external_id: `${item.external_id}-unknown`, status: "unknown" };
const forthcoming = { ...item, external_id: `${item.external_id}-forthcoming`, status: "forthcoming", currency: "EUR", total_budget: 1000000, min_amount: 1000, max_amount: 5000, expected_grants: 20 };
const source = await check(service.from("opportunity_sources").select("status,last_reviewed_at").eq("id", "bdns").single(), "Read local source configuration");
let activeRun;
let activeRaulRun;
let signedIn = false;
try {
  const auth = await check(user.auth.signUp({ email: `catalog-${fixture}@example.test`, password: `Local-${randomUUID()}-9!` }), "Real local Auth signup");
  assert.ok(auth.session, "Local test Auth must disable email confirmation");
  signedIn = true;
  await check(service.from("opportunity_sources").update({ status: "active" }).eq("id", "bdns"), "Activate local fixture source");
  const begin = async (suffix) => check(service.rpc("judy_begin_run", {
    p_request_id: `backend-${fixture}-${suffix}`, p_trigger: "test", p_parameters: { sources: ["bdns"], fixture },
  }), "Begin service ingestion");
  const ingest = (batch, items) => service.rpc("judy_upsert_opportunities", {
    p_run_id: activeRun.run_id, p_lease_token: activeRun.lease_token, p_batch_key: batch, p_items: items,
  });
  const finish = async () => {
    const result = await check(service.rpc("judy_finish_run", {
      p_run_id: activeRun.run_id, p_lease_token: activeRun.lease_token, p_report: report,
    }), "Finalize ingestion");
    activeRun = undefined;
    return result;
  };
  activeRun = await begin("first");
  assert.equal(activeRun.claimed, true);
  assert.equal((await check(service.rpc("judy_renew_run", { p_run_id: activeRun.run_id, p_lease_token: activeRun.lease_token }), "Renew real local ingestion lease")).status, "running");
  const duplicate = await begin("first");
  assert.equal(duplicate.run_id, activeRun.run_id);
  assert.equal(duplicate.claimed, false);
  assert.equal(Object.hasOwn(duplicate, "lease_token"), false, "Retries cannot acquire the owner's lease");
  const busy = await service.rpc("judy_begin_run", { p_request_id: `backend-${fixture}-busy`, p_trigger: "test", p_parameters: {} });
  assert.equal(busy.error?.code, "55P03", "A distinct concurrent run is refused as JUDY_BUSY");

  const privileged = [
    ["judy_begin_run", { p_request_id: `client-${fixture}`, p_trigger: "test", p_parameters: {} }],
    ["judy_get_run", { p_request_id: `backend-${fixture}-first` }],
    ["judy_renew_run", { p_run_id: activeRun.run_id, p_lease_token: activeRun.lease_token }],
    ["judy_upsert_opportunities", { p_run_id: activeRun.run_id, p_lease_token: activeRun.lease_token, p_batch_key: "intrusion", p_items: [item] }],
    ["judy_finish_run", { p_run_id: activeRun.run_id, p_lease_token: activeRun.lease_token, p_report: report }],
    ["raul_begin_run", { p_request_key: `client-${fixture}`, p_mode: "incremental", p_max_sources: 1 }],
    ["raul_upsert_opportunity", { p_run_id: activeRun.run_id, p_source_id: "bdns", p_external_id: `client-${fixture}`, p_data: {}, p_duration_ms: 0, p_credits_estimated: 0, p_credits_measured: null }],
    ["raul_record_source_result", { p_run_id: activeRun.run_id, p_source_id: "bdns", p_status: "failed", p_created: 0, p_updated: 0, p_unchanged: 0, p_discarded: 0, p_error_code: "CLIENT_TEST", p_credits_estimated: 0, p_credits_measured: null, p_duration_ms: 0 }],
    ["raul_finish_run", { p_run_id: activeRun.run_id, p_status: "failed" }],
    ["raul_expire_run", { p_run_id: activeRun.run_id }],
    ["raul_fail_run", { p_run_id: activeRun.run_id, p_error_code: "CLIENT_TEST" }],
  ];
  for (const client of [anon, user]) {
    for (const [name, args] of privileged) await deny(client.rpc(name, args), `Public clients cannot execute ${name}`);
    for (const table of ["judy_runs", "judy_run_batches", "raul_runs", "raul_source_runs", "opportunity_versions"]) {
      await deny(client.from(table).select("*").limit(1), `No client read of ${table}`);
    }
  }
  await deny(anon.from("opportunities").select("id").limit(1), "Anonymous users cannot read the catalog");
  await deny(anon.from("funding_details").select("opportunity_id").limit(1), "Anonymous users cannot read funding details");

  assert.deepEqual(await check(ingest("batch-1", [item, unknown, forthcoming]), "Persist funding batch"), { created: 3, updated: 0, unchanged: 0, reused: false });
  assert.deepEqual(await check(ingest("batch-1", [item, unknown, forthcoming]), "Replay exact funding batch"), { created: 3, updated: 0, unchanged: 0, reused: true });
  await deny(ingest("batch-1", [{ ...item, title: "Changed payload under the same batch key" }]), "A batch key cannot change its payload");
  const rollbackId = `${item.external_id}-a-rollback`;
  await deny(ingest("malformed", [{ ...item, external_id: rollbackId }, { ...item, external_id: `${item.external_id}-z-invalid`, currency: "EUR", min_amount: 200, max_amount: 100 }]), "Invalid money constraints abort the entire batch");
  assert.deepEqual(await check(service.from("opportunities").select("id").eq("external_id", rollbackId), "Verify atomic rollback"), []);
  const firstSummary = await finish();
  assert.equal(firstSummary.created, 3, "Replay does not double count committed work");
  assert.equal(firstSummary.status, "completed");
  assert.equal(Object.hasOwn(firstSummary, "lease_token"), false);

  let row = await check(user.from("opportunities").select("*").eq("source_id", "bdns").eq("external_id", item.external_id).single(), "Authenticated public-key catalog read");
  assert.equal(row.opportunity_type, "research_funding");
  assert.equal(row.content_version, 1);
  assert.notEqual(row.content_hash, item.content_hash, "Server computes the factual hash");
  const opportunityId = row.id;
  const detail = await check(user.from("funding_details").select("*").eq("opportunity_id", opportunityId).single(), "Authenticated funding metadata read");
  for (const field of ["programme", "call_identifier", "instrument", "scope", "regions", "eligible_beneficiaries", "beneficiary_notes", "currency", "total_budget", "min_amount", "max_amount", "expected_grants", "deadline_text", "keywords", "language"]) {
    assert.deepEqual(detail[field], item[field], `Funding fact ${field} round-trips without inference`);
  }
  assert.deepEqual(await check(user.from("scholarship_details").select("opportunity_id").eq("opportunity_id", opportunityId), "Funding has no inferred scholarship eligibility"), []);
  const visible = await check(user.from("opportunities").select("external_id").in("external_id", [item.external_id, unknown.external_id, forthcoming.external_id]), "Temporal status filtering");
  assert.deepEqual(visible.map(value => value.external_id).sort(), [item.external_id, forthcoming.external_id].sort());
  const futureRow = await check(user.from("opportunities").select("id").eq("source_id", "bdns").eq("external_id", forthcoming.external_id).single(), "Read forthcoming call");
  const knownMoney = await check(user.from("funding_details").select("currency,total_budget,min_amount,max_amount,expected_grants").eq("opportunity_id", futureRow.id).single(), "Read confirmed monetary facts");
  assert.deepEqual(knownMoney, { currency: "EUR", total_budget: 1000000, min_amount: 1000, max_amount: 5000, expected_grants: 20 });

  for (const client of [anon, user]) {
    for (const [table, changes, column, value] of [
      ["opportunities", { title: "Client write intrusion" }, "id", opportunityId],
      ["funding_details", { programme: "Client write intrusion" }, "opportunity_id", opportunityId],
      ["opportunity_sources", { status: "paused" }, "id", "bdns"],
    ]) await deny(client.from(table).update(changes).eq(column, value).select(), `No client write to ${table}`);
  }
  row = await check(service.from("opportunities").select("title").eq("id", opportunityId).single(), "Verify catalog unchanged after intrusion");
  assert.equal(row.title, item.title);

  activeRun = await begin("recheck");
  assert.equal((await check(ingest("recheck", [{ ...item, raw: { refreshed: true }, content_hash: "f".repeat(64) }]), "Recheck factual data")).unchanged, 1);
  await finish();
  activeRun = await begin("revision");
  assert.equal((await check(ingest("revision", [{ ...item, title: "Revised local funding fact" }]), "Persist factual revision")).updated, 1);
  await finish();
  const versions = await check(service.from("opportunity_versions").select("version,snapshot").eq("opportunity_id", opportunityId).order("version"), "Read durable version history");
  assert.deepEqual(versions.map(value => value.version), [1, 2]);
  assert.equal(versions[0].snapshot.title, item.title);
  assert.equal(versions[1].snapshot.title, "Revised local funding fact");

  // Exercise Judy's actual server adapter against the real local REST API. The
  // injected transport forwards every request locally, then loses ONE successful
  // response to prove its retry cannot double count an already committed batch.
  const adapterRequestId = `adapter-${fixture}`;
  const adapterConfig = { url, serviceKey };
  const adapterParameters = { sources: ["bdns"], sinceDays: 120, maxPerSource: 10 };
  activeRun = await adapterBeginRun(adapterConfig, adapterRequestId, "cli", adapterParameters);
  assert.equal(activeRun.claimed, true);
  const adapterItem = { ...item, external_id: `adapter-item-${fixture}`, title: "Local item persisted through Judy adapter" };
  const adapterReport = {
    started_at: new Date().toISOString(), finished_at: new Date().toISOString(), items: [adapterItem],
    stats: { bdns: { collected: 1, skipped: 0, errors: 0, open: 1, forthcoming: 0 } }, errors: [], skipped: [],
  };
  let lostResponse = false;
  const adapterSummary = await saveToSupabase({ ...adapterConfig, fetch: async (input, init) => {
    const response = await fetch(input, init);
    if (input.endsWith("/rpc/judy_upsert_opportunities") && response.ok && !lostResponse) {
      lostResponse = true;
      await response.arrayBuffer();
      throw new Error("Local test: response lost after committed ingestion");
    }
    return response;
  } }, adapterReport, activeRun);
  activeRun = undefined;
  assert.equal(lostResponse, true, "The retry scenario must actually run");
  assert.equal(adapterSummary.status, "completed");
  assert.equal(adapterSummary.created, 1, "Real adapter retry accounts the committed batch once");
  const durableAdapterRun = await adapterGetRun(adapterConfig, adapterRequestId);
  assert.equal(durableAdapterRun.created, 1);
  assert.equal(Object.hasOwn(durableAdapterRun, "lease_token"), false);
  const adapterReplay = await adapterBeginRun(adapterConfig, adapterRequestId, "cli", adapterParameters);
  assert.equal(adapterReplay.claimed, false);
  assert.equal(adapterReplay.status, "completed");
  const adapterRow = await check(user.from("opportunities").select("id,title,content_version").eq("external_id", adapterItem.external_id).single(), "Public-key frontend reads real adapter output");
  assert.equal(adapterRow.title, adapterItem.title);
  assert.equal(adapterRow.content_version, 1);
  assert.equal((await check(service.from("opportunity_versions").select("version").eq("opportunity_id", adapterRow.id), "Real adapter creates exactly one durable version")).length, 1);

  activeRaulRun = await check(service.rpc("raul_begin_run", { p_request_key: `backend-raul-${fixture}`, p_mode: "incremental", p_max_sources: 1 }), "Begin real local scholarship ingestion");
  const scholarshipDetails = {
    academic_stages: [], degree_areas: [], residence_requirement: { state: "unknown", value: null },
    amount: { state: "unknown", value: null },
    requirements: [{ key: "residence", label: "Residencia", state: "unknown", value: null }],
    missing_information: ["Amount, residence and eligibility were not provided by the fixture source"],
  };
  const scholarshipData = {
    opportunity_type: "scholarship", title: "Local scholarship with unknown requirements", provider: "Local university",
    summary: "Local fixture; not an eligibility assessment", official_url: "https://example.invalid/scholarship",
    official_deadline_date: "2099-12-31", checked_at: new Date(Date.now() - 1000).toISOString(), status: "open",
    provenance: { source_url: "https://example.invalid/source", parser_version: "local-test" }, scholarship_details: scholarshipDetails,
  };
  const scholarship = await check(service.rpc("raul_upsert_opportunity", {
    p_run_id: activeRaulRun.run_id, p_source_id: "bdns", p_external_id: `scholarship-${fixture}`, p_data: scholarshipData,
    p_duration_ms: 0, p_credits_estimated: 0, p_credits_measured: null,
  }), "Persist real local scholarship with unknown data");
  await check(service.rpc("raul_finish_run", { p_run_id: activeRaulRun.run_id, p_status: "completed" }), "Finalize scholarship ingestion");
  activeRaulRun = undefined;
  const readScholarship = await check(user.from("scholarship_details").select("*").eq("opportunity_id", scholarship.opportunity_id).single(), "Real JWT reads unknown scholarship details");
  for (const field of ["academic_stages", "degree_areas", "residence_requirement", "amount", "requirements", "missing_information"]) {
    assert.deepEqual(readScholarship[field], scholarshipDetails[field], `Unknown scholarship ${field} remains unknown without inference`);
  }

  const hidden = async (label) => {
    assert.deepEqual(await check(user.from("opportunities").select("id").eq("id", opportunityId), label), []);
    assert.deepEqual(await check(user.from("funding_details").select("opportunity_id").eq("opportunity_id", opportunityId), `${label}: details`), []);
  };
  for (const status of ["paused", "pending_review"]) {
    await check(service.from("opportunity_sources").update({ status }).eq("id", "bdns"), "Change local source state");
    await hidden(`RLS hides ${status} source`);
  }
  await check(service.from("opportunity_sources").update({ status: "active" }).eq("id", "bdns"), "Restore active source for freshness checks");
  for (const milliseconds of [-15 * 86400000, 86400000]) {
    await check(service.from("opportunities").update({ checked_at: new Date(Date.now() + milliseconds).toISOString() }).eq("id", opportunityId), "Change local freshness fixture");
    await hidden("RLS hides stale/future checks");
  }
  await check(service.from("opportunities").update({ checked_at: new Date(Date.now() - 1000).toISOString(), official_deadline_at: new Date(Date.now() - 86400000).toISOString() }).eq("id", opportunityId), "Expire local deadline fixture");
  await hidden("RLS hides expired deadline and nested details");
  console.log("PASS: real local Auth + public-key REST reads, anon denial, service-only writes/runs, atomic Judy batches/idempotence, factual versions, unknown funding/scholarship facts and source/freshness/deadline RLS.");
} finally {
  if (activeRun) await service.rpc("judy_finish_run", { p_run_id: activeRun.run_id, p_lease_token: activeRun.lease_token, p_report: { stats: {}, errors: ["LOCAL_TEST_ABORTED"], skipped: [] } });
  if (activeRaulRun) await service.rpc("raul_fail_run", { p_run_id: activeRaulRun.run_id, p_error_code: "LOCAL_TEST_ABORTED" });
  await check(service.from("opportunity_sources").update(source).eq("id", "bdns"), "Restore local source configuration");
  if (signedIn) await check(user.auth.signOut(), "Local test signout");
}
