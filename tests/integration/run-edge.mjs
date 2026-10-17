import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localConfig } from "./local-config.mjs";
import { edgeFailure } from "./edge-diagnostics.mjs";

const { url, key } = localConfig(); // Hard stop before spawning against a remote backend.
const directory = await mkdtemp(join(tmpdir(), "nexolab-edge-test-"));
const envFile = join(directory, "test.env");
const token = randomUUID();
await writeFile(
  envFile,
  `RAUL_TRIGGER_TOKEN=${token}\nFIRECRAWL_API_KEY=\nORCID_CLIENT_ID=\nORCID_CLIENT_SECRET=\n`,
  { mode: 0o600 },
);
const worker = spawn(
  process.execPath,
  [
    "node_modules/supabase/dist/supabase.js",
    "functions",
    "serve",
    "--env-file",
    envFile,
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RAUL_TRIGGER_TOKEN: token,
      FIRECRAWL_API_KEY: "",
      ORCID_CLIENT_ID: "",
      ORCID_CLIENT_SECRET: "",
    },
  },
);
let output = "";
for (const stream of [worker.stdout, worker.stderr])
  stream.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-16384);
  });
let spawnFailure = false;
worker.on("error", () => {
  spawnFailure = true;
});
const run = (file) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      stdio: "inherit",
      env: {
        ...process.env,
        NEXOLAB_TEST_URL: url,
        NEXOLAB_TEST_PUBLISHABLE_KEY: key,
        NEXOLAB_EXPECT_ORCID_UNCONFIGURED: "1",
        NEXOLAB_TEST_RAUL_TOKEN: token,
        NEXOLAB_EDGE_ISOLATED: "1",
      },
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${file}: exit ${code}`)),
    );
  });
try {
  const deadline = Date.now() + 30000;
  let ready = false;
  let last;
  while (Date.now() < deadline && !spawnFailure) {
    if (worker.exitCode !== null) break;
    try {
      last = await fetch(`${url}/functions/v1/raul-trigger`, {
        method: "POST",
        headers: { apikey: key },
        signal: globalThis.AbortSignal.timeout(1500),
      });
      if (
        last.status === 401 &&
        (await last.clone().json()).error === "unauthorized"
      ) {
        ready = true;
        break;
      }
      await last.body?.cancel();
    } catch {
      /* Runtime startup is bounded; the final failure emits safe diagnostics. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) {
    await edgeFailure(
      last ?? new globalThis.Response(null, { status: 503 }),
      "Edge runtime startup",
      output,
    );
    throw new Error(
      "Local Edge runtime did not become ready; no 503 is accepted as successful authentication.",
    );
  }
  await run("tests/integration/profile-import-edge.mjs");
  await run("tests/integration/raul-edge.mjs");
} finally {
  worker.kill("SIGTERM");
  await unlink(envFile);
  await rmdir(directory);
}
