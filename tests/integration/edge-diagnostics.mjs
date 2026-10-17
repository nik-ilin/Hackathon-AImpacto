import { execFileSync } from "node:child_process";
import { TextDecoder } from "node:util";

// Emit only known categories and repository module paths, never raw worker logs,
// HTTP bodies, Authorization headers, environment variables or response data.
export async function edgeFailure(response, label, workerOutput = "") {
  let text = "";
  try {
    const reader = response.body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      text = new TextDecoder().decode(value?.slice(0, 4096));
      await reader.cancel();
    }
  } catch {
    /* Diagnostics must preserve the original assertion. */
  }
  let dockerLogs = "";
  try {
    const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const runtime = names
      .split(/\r?\n/)
      .find((name) => /^supabase_edge_runtime_[a-zA-Z0-9_-]+$/.test(name));
    if (runtime)
      dockerLogs = execFileSync("docker", ["logs", "--tail", "40", runtime], {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      });
  } catch {
    /* Docker is optional; status/body classification remains useful. */
  }
  const combined = `${text}\n${workerOutput.slice(-16384)}\n${dockerLogs.slice(-16384)}`;
  const diagnostics = {
    check: label,
    status: response.status,
    bootFailure: /BOOT_ERROR|boot error|worker boot|failed to boot/i.test(
      combined,
    ),
    moduleResolutionFailure:
      /module not found|cannot resolve|could not find|relative import path.*not prefixed/i.test(
        combined,
      ),
    moduleHints: [
      ...new Set(
        combined.match(
          /(?:profile-orcid|raul-trigger|_shared)\/[a-zA-Z0-9_./-]+\.ts/g,
        ) ?? [],
      ),
    ].slice(0, 8),
    configurationMissing:
      /not configured|no est[aá] configurada|backend_configuration_error/i.test(
        combined,
      ),
  };
  process.stderr.write(`Edge diagnostics: ${JSON.stringify(diagnostics)}\n`);
  return diagnostics;
}

export async function expectEdgeStatus(response, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(response.status)) {
    await edgeFailure(response, label);
    throw new Error(
      `${label}: expected HTTP ${statuses.join("/")}, got ${response.status}. A boot 503 is not an authentication success.`,
    );
  }
}
