import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { localConfig } from "./local-config.mjs";
import { expectEdgeStatus } from "./edge-diagnostics.mjs";

const { url, key } = localConfig();
const triggerToken = process.env.NEXOLAB_TEST_RAUL_TOKEN;
if (!triggerToken || process.env.NEXOLAB_EDGE_ISOLATED !== "1")
  throw new Error(
    "Use run-edge.mjs: Raúl tests require synthetic credentials and disabled external-provider credentials.",
  );
const endpoint = `${url}/functions/v1/raul-trigger`;
const connectionString =
  process.env.LOCAL_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(connectionString).hostname,
  )
)
  throw new Error("Raúl Edge fixtures require loopback PostgreSQL.");
const db = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
});
const runIds = [];
const prefix = `edge_${randomUUID().replaceAll("-", "")}`;
const send = (
  method = "POST",
  token = triggerToken,
  requestId = `${prefix}_partial`,
  runId,
) =>
  fetch(runId ? `${endpoint}?run_id=${runId}` : endpoint, {
    method,
    headers: {
      apikey: key,
      ...(token ? { "x-raul-trigger-key": token } : {}),
      "content-type": "application/json",
    },
    ...(method === "POST"
      ? {
          body: JSON.stringify({
            mode: "incremental",
            max_sources: 1,
            request_id: requestId,
          }),
        }
      : {}),
  });

await db.connect();
const sourceSnapshot = (
  await db.query(
    "select id,status,last_reviewed_at,updated_at from public.opportunity_sources where id='imdea_energy_2027'",
  )
).rows;
const opportunitySnapshot = (
  await db.query(
    "select id,status,updated_at from public.opportunities where source_id='imdea_energy_2027'",
  )
).rows;
try {
  for (const method of ["POST", "GET", "OPTIONS", "DELETE"]) {
    await expectEdgeStatus(
      await send(method, ""),
      401,
      `Raúl ${method} missing trigger`,
    );
    await expectEdgeStatus(
      await send(method, "wrong"),
      401,
      `Raúl ${method} invalid trigger`,
    );
  }
  const first = await send();
  await expectEdgeStatus(first, 207, "Raúl provider disabled initial partial");
  const initial = await first.json();
  runIds.push(initial.run_id);
  assert.equal(initial.status, "partial");
  const stored = (
    await db.query(
      "select status,error_codes,credits_estimated from public.raul_runs where id=$1",
      [initial.run_id],
    )
  ).rows[0];
  assert.equal(stored.status, "partial");
  assert.ok(stored.error_codes.includes("firecrawl_not_configured"));
  assert.equal(
    Number(stored.credits_estimated),
    0,
    "No paid external call is attempted.",
  );
  const replay = await send();
  await expectEdgeStatus(replay, 207, "Raúl identical partial replay");
  assert.equal((await replay.json()).run_id, initial.run_id);
  await expectEdgeStatus(
    await send("GET", triggerToken, undefined, initial.run_id),
    207,
    "Raúl partial status polling",
  );
  assert.equal(
    Number(
      (
        await db.query(
          "select count(*) n from public.raul_runs where request_key=$1",
          [`${prefix}_partial`],
        )
      ).rows[0].n,
    ),
    1,
  );

  const running = (
    await db.query(
      "insert into public.raul_runs(request_key,mode,max_sources,status) values($1,'incremental',1,'running') returning id",
      [`${prefix}_running`],
    )
  ).rows[0].id;
  runIds.push(running);
  await expectEdgeStatus(
    await send("POST", triggerToken, `${prefix}_running`),
    202,
    "Raúl running replay",
  );
  await expectEdgeStatus(
    await send("POST", triggerToken, `${prefix}_other`),
    429,
    "Raúl overlapping execution",
  );
  await db.query(
    "update public.raul_runs set lease_until=now()-interval '1 second' where id=$1",
    [running],
  );
  const expired = await send("GET", triggerToken, undefined, running);
  await expectEdgeStatus(expired, 500, "Raúl expired lease polling");
  assert.equal((await expired.json()).status, "failed");
  await expectEdgeStatus(
    await send("POST", triggerToken, `${prefix}_running`),
    500,
    "Raúl expired lease replay",
  );
  const durable = (
    await db.query(
      "select status,error_codes from public.raul_runs where id=$1",
      [running],
    )
  ).rows[0];
  assert.equal(durable.status, "failed");
  assert.ok(durable.error_codes.includes("LEASE_EXPIRED"));
  process.stdout.write(
    "Raúl Edge real local: auth all routes, durable 207 replay/poll, running 202, overlap429, expired500; no paid calls OK.\n",
  );
} finally {
  for (const row of sourceSnapshot) {
    await db.query(
      "update public.opportunity_sources set status=$2,last_reviewed_at=$3,updated_at=$4 where id=$1",
      [row.id, row.status, row.last_reviewed_at, row.updated_at],
    );
  }
  for (const row of opportunitySnapshot) {
    await db.query(
      "update public.opportunities set status=$2,updated_at=$3 where id=$1",
      [row.id, row.status, row.updated_at],
    );
  }
  if (runIds.length) {
    await db.query(
      "delete from public.raul_source_runs where run_id=any($1::uuid[])",
      [runIds],
    );
    await db.query("delete from public.raul_runs where id=any($1::uuid[])", [
      runIds,
    ]);
  }
  await db.end();
}
