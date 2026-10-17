import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createJudyServer } from "../src/server.ts";
import type { SupabaseConfig } from "../src/store/supabase.ts";
import type { CollectReport } from "../src/pipeline.ts";

const servers: Server[] = [];
const key = "fixture-judy-api-key-at-least-24";
const empty: CollectReport = { started_at: "2026-10-17T10:00:00Z", finished_at: "2026-10-17T10:01:00Z", items: [], errors: [], skipped: [], stats: {} };
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  return `http://127.0.0.1:${address.port}`;
}
describe("optional trusted-host server", () => {
  it("requires persistence and rejects unsigned callback configuration", () => {
    expect(() => createJudyServer({ env: { JUDY_API_KEY: key } })).toThrow("Persistence required");
    expect(() => createJudyServer({ env: { JUDY_API_KEY: key, MAKE_CALLBACK_URL: "https://example.org" } })).toThrow("Unsigned callbacks");
  });
  it("authenticates all routes, rejects invalid input, shares durable idempotency/concurrency, omits lease tokens", async () => {
    let active: string | undefined;
    let status = "running";
    let loads = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const config: SupabaseConfig = { url: "http://127.0.0.1:54321", serviceKey: "server-only-test", fetch: async (url, init) => {
      const name = url.split("/").at(-1);
      const body = JSON.parse(String(init?.body));
      const snapshot = () => ({ run_id: "00000000-0000-4000-8000-000000000001", status, lease_token: "never-public" });
      if (name === "judy_begin_run") {
        if (active && active !== body.p_request_id) return new Response(JSON.stringify({ code: "55P03" }), { status: 409 });
        const reused = !!active;
        active = body.p_request_id;
        return Response.json({ ...snapshot(), claimed: !reused, reused });
      }
      if (name === "judy_finish_run") status = "partial";
      return Response.json(name === "judy_get_run" && body.p_request_id !== active ? null : snapshot());
    } };
    const base = await listen(createJudyServer({ env: { JUDY_API_KEY: key }, config, collectReport: async () => { loads++; await gate; return { ...empty, errors: ["[bdns] provider error"] }; } }));
    for (const path of ["/health", "/runs/first-key", "/not-found"]) expect((await fetch(base + path)).status).toBe(401);
    const headers = { "x-judy-key": key, "content-type": "application/json" };
    expect((await fetch(base + "/run", { method: "POST", headers, body: "{" })).status).toBe(400);
    expect((await fetch(base + "/run", { method: "POST", headers, body: JSON.stringify({ request_id: "bad", maxPerSource: "nan" }) })).status).toBe(400);
    const first = await fetch(base + "/run", { method: "POST", headers, body: JSON.stringify({ request_id: "first-key", sources: "bdns" }) });
    expect(first.status).toBe(202);
    expect(await first.text()).not.toContain("never-public");
    const repeat = await fetch(base + "/run", { method: "POST", headers, body: JSON.stringify({ request_id: "first-key", sources: "bdns" }) });
    expect(repeat.status).toBe(202);
    expect(loads).toBe(1);
    const busy = await fetch(base + "/run", { method: "POST", headers, body: JSON.stringify({ request_id: "second-key", sources: "bdns" }) });
    expect(busy.status).toBe(429);
    expect(await busy.json()).toMatchObject({ error: "JUDY_BUSY", retry_after: 60 });
    release();
    for (let attempt = 0; attempt < 20 && status === "running"; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    const poll = await fetch(base + "/runs/first-key", { headers });
    expect(poll.status).toBe(207);
    expect(await poll.text()).not.toContain("never-public");
    expect((await fetch(base + "/runs/short", { headers })).status).toBe(400);
    expect((await fetch(base + "/runs/missing-key", { headers })).status).toBe(404);
    expect((await fetch(base + "/run", { method: "POST", headers, body: JSON.stringify({ request_id: "first-key", sources: "bdns" }) })).status).toBe(207);
    expect(loads).toBe(1);
  });
});
