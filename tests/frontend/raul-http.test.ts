import { describe, expect, it, vi } from "vitest";
import {
  handleRaulRequest,
  type RaulDatabase,
} from "../../supabase/functions/raul-trigger/handler.ts";
import { sourceSpecs } from "../../supabase/functions/raul-trigger/catalog.ts";

const id = "11111111-1111-4111-8111-111111111111";
const body = {
  mode: "incremental",
  max_sources: 1,
  request_id: "request_12345",
};
const makeRequest = (
  method = "POST",
  token: string | null = "trigger",
  value: unknown = body,
) =>
  new Request(`http://localhost/functions/v1/raul-trigger?run_id=${id}`, {
    method,
    headers: token ? { "x-raul-trigger-key": token } : {},
    ...(method === "POST" ? { body: JSON.stringify(value) } : {}),
  });
const officialText =
  "IMDEA Energy launches 30 internships for Bachelor's and Master's students in 2027. Applications close 7 November 2026. Applicants need a residence permit in Spain during the internship. Grants up to 2,200 euros for Bachelor students and 2,500 euros for Master students. Energy research internships.";
function setup(
  options: {
    reused?: boolean;
    status?: string;
    busy?: boolean;
    registryMismatch?: boolean;
    failWrite?: boolean;
  } = {},
) {
  const rpc = vi.fn<RaulDatabase["rpc"]>(async (name, args) => {
    if (name === "raul_begin_run")
      return options.busy
        ? { data: null, error: { message: "RAUL_BUSY" } }
        : {
            data: { run_id: id, reused: options.reused ?? false },
            error: null,
          };
    if (name === "raul_expire_run")
      return {
        data: {
          id,
          status: options.status ?? "partial",
          error_codes: options.status === "failed" ? ["LEASE_EXPIRED"] : [],
        },
        error: null,
      };
    if (name === "raul_upsert_opportunity")
      return { data: { result: "created" }, error: null };
    if (name === "raul_finish_run" || name === "raul_fail_run")
      return {
        data: {
          id,
          status: name === "raul_fail_run" ? "failed" : args.p_status,
        },
        error: null,
      };
    return {
      data: null,
      error: options.failWrite
        ? { message: "service-key must never leak" }
        : null,
    };
  });
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: options.registryMismatch
            ? null
            : {
                id: sourceSpecs[0].id,
                status: "active",
                official_url: sourceSpecs[0].url,
              },
          error: null,
        }),
      }),
    }),
  }));
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({ success: true, data: { markdown: officialText } }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  const createDatabase = vi.fn(() => ({ rpc, from }));
  return {
    rpc,
    from,
    fetcher,
    createDatabase,
    deps: {
      triggerToken: "trigger",
      firecrawlKey: "private-firecrawl-key",
      createDatabase,
      fetch: fetcher,
    },
  };
}

describe("Raúl HTTP authentication and durable replay", () => {
  it.each(["GET", "POST", "OPTIONS", "DELETE"])(
    "authenticates %s before route, body and configuration",
    async (method) => {
      const s = setup();
      for (const token of [null, "wrong"]) {
        const response = await handleRaulRequest(
          makeRequest(method, token, { invalid: true }),
          s.deps,
        );
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthorized" });
      }
      expect(s.createDatabase).not.toHaveBeenCalled();
      expect(s.fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects absent configured trigger secret", async () => {
    const s = setup();
    expect(
      (
        await handleRaulRequest(makeRequest(), {
          ...s.deps,
          triggerToken: undefined,
        })
      ).status,
    ).toBe(401);
    expect(s.createDatabase).not.toHaveBeenCalled();
  });
  it.each([
    ["running", 202],
    ["completed", 200],
    ["partial", 207],
    ["failed", 500],
  ])(
    "replays and polls durable %s as %i without collecting again",
    async (status, code) => {
      const s = setup({ reused: true, status });
      const response = await handleRaulRequest(makeRequest(), s.deps);
      expect(response.status).toBe(code);
      expect((await response.json()).status).toBe(status);
      const poll = await handleRaulRequest(makeRequest("GET"), s.deps);
      expect(poll.status).toBe(code);
      expect(s.rpc).toHaveBeenCalledWith("raul_expire_run", { p_run_id: id });
      expect(s.fetcher).not.toHaveBeenCalled();
    },
  );
  it("reports fresh successful collection 200 with an official allowlist URL only", async () => {
    const s = setup();
    const response = await handleRaulRequest(makeRequest(), s.deps);
    expect(response.status).toBe(200);
    expect(s.rpc).toHaveBeenCalledWith(
      "raul_upsert_opportunity",
      expect.objectContaining({ p_source_id: sourceSpecs[0].id }),
    );
    expect(s.fetcher.mock.calls[0][0]).toBe(
      "https://api.firecrawl.dev/v2/scrape",
    );
    expect(JSON.parse(String(s.fetcher.mock.calls[0][1]?.body)).url).toBe(
      sourceSpecs[0].url,
    );
  });
  it("reports collection failures 207 and saves a sanitized durable error", async () => {
    const s = setup();
    s.fetcher.mockRejectedValueOnce(
      new Error("private-firecrawl-key https://private/"),
    );
    const response = await handleRaulRequest(makeRequest(), s.deps);
    expect(response.status).toBe(207);
    expect(s.rpc).toHaveBeenCalledWith(
      "raul_record_source_result",
      expect.objectContaining({ p_error_code: "extraction_failed" }),
    );
    expect(await response.text()).not.toContain("private-firecrawl-key");
  });
  it("rejects overlap 429 and does no paid work", async () => {
    const s = setup({ busy: true });
    expect((await handleRaulRequest(makeRequest(), s.deps)).status).toBe(429);
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("persists registry mismatch instead of silently losing the failure", async () => {
    const s = setup({ registryMismatch: true });
    const response = await handleRaulRequest(makeRequest(), s.deps);
    expect(response.status).toBe(500);
    expect(s.rpc).toHaveBeenCalledWith("raul_fail_run", {
      p_run_id: id,
      p_error_code: "SOURCE_REGISTRY_MISMATCH",
    });
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("reports backend failures without exposing exception text or secrets", async () => {
    const s = setup();
    const response = await handleRaulRequest(makeRequest(), {
      ...s.deps,
      createDatabase: () => {
        throw new Error("service-key");
      },
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("service-key");
  });
});
