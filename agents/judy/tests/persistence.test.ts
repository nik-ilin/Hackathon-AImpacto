import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beginRun, saveToSupabase, supabaseConfigFromEnv, type SupabaseConfig } from "../src/store/supabase.ts";
import { parameters, requestId, runCollection } from "../src/runner.ts";
import type { CollectReport } from "../src/pipeline.ts";

const empty: CollectReport = { started_at: "2026-10-17T10:00:00Z", finished_at: "2026-10-17T10:01:00Z", items: [], errors: [], skipped: [], stats: { bdns: { collected: 0, skipped: 0, errors: 0, open: 0, forthcoming: 0 } } };
const state = { run_id: "a19c762d-457f-427c-bf7d-35ec9a7af5fd", status: "running" as const, claimed: true, lease_token: "00000000-0000-4000-8000-000000000001" };
const params = parameters("bdns", 120, 10);
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function store(handler: (name: string, body: Record<string, unknown>) => Response | Promise<Response>): SupabaseConfig {
  return { url: "http://127.0.0.1:54321", serviceKey: "test-server-only", fetch: async (url, init) => handler(url.split("/").at(-1)!, JSON.parse(String(init?.body))) };
}

describe("canonical RPC adapter and durable runner", () => {
  it("CLI entry point exits nonzero with an explicit missing-persistence error", () => {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "src/cli.ts", "--sources", "bdns"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)), env: { SystemRoot: process.env.SystemRoot }, encoding: "utf8", timeout: 15_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Persistence required");
    expect(result.stdout).toBe("");
  }, 20_000);
  it("fails preflight with missing credentials before collection; only explicit dry run bypasses persistence", async () => {
    const load = vi.fn(async () => empty);
    await expect(runCollection({ requestId: "test1", trigger: "cli", params }, { env: {}, collectReport: load })).rejects.toThrow("Persistence required");
    expect(load).not.toHaveBeenCalled();
    expect((await runCollection({ requestId: "dry1", trigger: "cli", params, dryRun: true }, { env: {}, collectReport: load })).state.status).toBe("dry_run");
    expect(load).toHaveBeenCalledOnce();
  });
  it("rejects malformed parameters and remote HTTP; allows local stack HTTP", () => {
    expect(() => parameters("bdns", NaN, 10)).toThrow();
    expect(() => parameters("unknown", 1, 1)).toThrow();
    expect(() => parameters("bdns", 1.2, 2)).toThrow();
    expect(() => requestId("x/../bad")).toThrow();
    expect(() => supabaseConfigFromEnv({ SUPABASE_URL: "http://host.example", SUPABASE_SECRET_KEY: "s" })).toThrow();
    expect(supabaseConfigFromEnv({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "s" }).url).toBe("http://127.0.0.1:54321");
  });
  it("passes immutable request/params to claim and skips collection on terminal/live duplicate", async () => {
    const load = vi.fn(async () => empty);
    const config = store((name, body) => {
      expect(name).toBe("judy_begin_run");
      expect(body).toEqual({ p_request_id: "same", p_trigger: "cli", p_parameters: params });
      return response({ ...state, claimed: false, reused: true, status: "completed" });
    });
    const result = await runCollection({ requestId: "same", trigger: "cli", params }, { config, collectReport: load });
    expect(result.state.status).toBe("completed");
    expect(load).not.toHaveBeenCalled();
  });
  it("renews and persists even empty runs, retaining partial source errors", async () => {
    const calls: string[] = [];
    const config = store((name, body) => {
      calls.push(name);
      if (name === "judy_begin_run") return response(state);
      if (name === "judy_finish_run") {
        expect(body.p_lease_token).toBe(state.lease_token);
        expect(body.p_report).toMatchObject({ errors: ["[bdns] HTTP503"] });
        return response({ run_id: state.run_id, status: "failed" });
      }
      return response({});
    });
    const result = await runCollection({ requestId: "empty", trigger: "cli", params }, { config, collectReport: async () => ({ ...empty, errors: ["[bdns] HTTP503"] }) });
    expect(result.state.status).toBe("failed");
    expect(calls).toEqual(["judy_begin_run", "judy_renew_run", "judy_finish_run"]);
  });
  it("retries a lost upsert response using identical run/lease/batch payload, then finalizes", async () => {
    let attempts = 0;
    const bodies: unknown[] = [];
    const config = store((name, body) => {
      if (name === "judy_upsert_opportunities") {
        bodies.push(body);
        if (++attempts === 1) throw new Error("Lost response after commit");
        return response({ created: 1, updated: 0, unchanged: 0, reused: true });
      }
      return response({ run_id: state.run_id, status: "completed", created: 1 });
    });
    const item = { source: "bdns", external_id: "1", url: "https://official.example/1", source_url: "https://official.example/1", bases_url: null } as CollectReport["items"][number];
    expect((await saveToSupabase(config, { ...empty, items: [item] }, state)).status).toBe("completed");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toMatchObject({ p_batch_key: "batch-0000", p_run_id: state.run_id, p_lease_token: state.lease_token });
  });
  it("does not retry authorization failures and does not leak response body or key", async () => {
    const config = store(() => response({ code: "42501", message: "sensitive raw value" }, 403));
    await expect(beginRun(config, "x", "cli", params)).rejects.toThrow("HTTP 403");
    try { await beginRun(config, "x", "cli", params); } catch (error) { expect(String(error)).not.toContain("sensitive"); }
  });
  it("replays the identical terminal report after a lost finish response", async () => {
    const reports: unknown[] = [];
    const config = store((name, body) => {
      expect(name).toBe("judy_finish_run");
      reports.push(body);
      if (reports.length === 1) throw new Error("Response lost after terminal commit");
      return response({ run_id: state.run_id, status: "completed" });
    });
    expect((await saveToSupabase(config, empty, state)).status).toBe("completed");
    expect(reports).toHaveLength(2);
    expect(reports[0]).toEqual(reports[1]);
  });
  it("records collection failures instead of reporting success", async () => {
    let failed = false;
    const config = store((name, body) => {
      if (name === "judy_finish_run") { failed = true; expect(body.p_report).toMatchObject({ errors: [expect.stringContaining("failed")] }); }
      return response(name === "judy_begin_run" ? state : { run_id: state.run_id, status: "failed" });
    });
    await expect(runCollection({ requestId: "bad", trigger: "cli", params }, { config, collectReport: async () => { throw new Error("failed source"); } })).rejects.toThrow("failed source");
    expect(failed).toBe(true);
  });
});
