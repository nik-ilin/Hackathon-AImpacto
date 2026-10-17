import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { toCsv } from "./pipeline.ts";
import { parameters, requestId, runCollection } from "./runner.ts";
import { PersistenceConfigurationError, JudyBatchError, StoreError } from "./store/supabase.ts";
export { parseSources } from "./runner.ts";

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    sources: { type: "string" }, "since-days": { type: "string", default: "120" }, max: { type: "string", default: "600" },
    out: { type: "string" }, "dry-run": { type: "boolean", default: false }, trigger: { type: "string", default: "cli" }, "request-id": { type: "string" },
  } });
  if (!["cli", "make", "schedule"].includes(values.trigger!)) throw new Error("Invalid trigger");
  const id = requestId(values["request-id"]);
  let result;
  try {
    result = await runCollection({ requestId: id, trigger: values.trigger as "cli" | "make" | "schedule", params: parameters(values.sources, values["since-days"], values.max), dryRun: values["dry-run"] });
  } catch (error) {
    const diagnostic = error instanceof JudyBatchError
      ? { kind: "batch_write_failed", batch_index: error.batchIndex, http_status: error.httpStatus, rpc_code: error.rpcCode }
      : error instanceof StoreError
        ? { kind: "supabase_rpc_failed", http_status: error.status, rpc_code: error.code ?? null }
        : error instanceof PersistenceConfigurationError
          ? { kind: "persistence_configuration_missing" }
          : { kind: "collection_or_finalize_failed" };
    // Write status even if no successful report exists; never serialize provider or RPC payloads.
    if (values.out) {
      mkdirSync(values.out, { recursive: true });
      writeFileSync(join(values.out, "run.json"), JSON.stringify({ request_id: id, status: "failed", diagnostic }, null, 2));
    }
    console.error(JSON.stringify({ request_id: id, diagnostic }));
    throw error;
  }
  const state = Object.fromEntries(Object.entries(result.state).filter(([key]) => key !== "lease_token"));
  console.log(JSON.stringify({ request_id: id, ...state, stats: result.report?.stats }, null, 2));
  if (values.out) {
    mkdirSync(values.out, { recursive: true });
    writeFileSync(join(values.out, "run.json"), JSON.stringify({ request_id: id, ...state }, null, 2));
    if (result.report) {
      writeFileSync(join(values.out, "opportunities.json"), JSON.stringify(result.report.items, null, 2));
      writeFileSync(join(values.out, "opportunities.csv"), toCsv(result.report.items));
      writeFileSync(join(values.out, "report.json"), JSON.stringify({ ...result.report, items: undefined }, null, 2));
    }
  }
  if (["partial", "failed", "running"].includes(result.state.status) || (result.state.status === "dry_run" && result.report?.errors.length)) process.exitCode = 1;
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    if (error instanceof PersistenceConfigurationError) console.error(error.message);
    else console.error("Judy failed. Inspect sanitized diagnostic in run.json or query the durable run status.");
    process.exitCode = 1;
  });
}
