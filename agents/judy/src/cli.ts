import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { toCsv } from "./pipeline.ts";
import { parameters, requestId, runCollection } from "./runner.ts";
import { PersistenceConfigurationError } from "./store/supabase.ts";
export { parseSources } from "./runner.ts";

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    sources: { type: "string" }, "since-days": { type: "string", default: "120" }, max: { type: "string", default: "600" },
    out: { type: "string" }, "dry-run": { type: "boolean", default: false }, trigger: { type: "string", default: "cli" }, "request-id": { type: "string" },
  } });
  if (!["cli", "make", "schedule"].includes(values.trigger!)) throw new Error("Invalid trigger");
  const id = requestId(values["request-id"]);
  const result = await runCollection({ requestId: id, trigger: values.trigger as "cli" | "make" | "schedule", params: parameters(values.sources, values["since-days"], values.max), dryRun: values["dry-run"] });
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
    console.error(error instanceof PersistenceConfigurationError ? error.message : "Judy failed. Check configuration and durable run status; no credentials are logged.");
    process.exitCode = 1;
  });
}
