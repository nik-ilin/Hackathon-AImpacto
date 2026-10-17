import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixture = resolve("tests/fixtures/database-generated-pr4.ts");
const generated = readFileSync(fixture, "utf8");
const check = (file: string) => {
  const result = spawnSync(process.execPath, [
    "tests/integration/check-generated-types.mjs", "--generated-file", file,
  ], { encoding: "utf8" });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
};

describe("official PostgreSQL type contract (PR #4 artifact)", () => {
  it("accepts the unmodified official generated types without Docker", () => {
    const result = check(fixture);
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("RPC coherentes");
  });

  it.each([
    {
      label: "NOT NULL JSON column",
      from: '"raw": NonNullable<Json>', to: '"raw": Json',
      diagnostic: /Tables\.funding_details\.Row\.raw: expected NonNullable<ExpectedJson>; generated .*Json/,
    },
    {
      label: "scalar column",
      from: '"full_name": string', to: '"full_name": number',
      diagnostic: /Tables\.profiles\.Row\.full_name: expected string; generated number/,
    },
    {
      label: "nullable column",
      from: '"username": string | null', to: '"username": string',
      diagnostic: /Tables\.profiles\.Row\.username: expected string \| null; generated string/,
    },
    {
      label: "missing table",
      from: '"funding_details": {', to: '"renamed_funding_details": {',
      diagnostic: /Tables\.funding_details\.Row: expected FundingDetail; generated <missing>/,
    },
    {
      label: "RPC parameter name",
      from: '"p_topic_ids": (string)[] }; Returns: undefined',
      to: '"p_topics": (string)[] }; Returns: undefined',
      diagnostic: /Functions\.save_group_topics\.Args\.p_topic_ids: expected string\[\]; generated <missing>/,
    },
    {
      label: "RPC parameter requiredness",
      from: '"p_message"?: string', to: '"p_message": string',
      diagnostic: /Functions\.request_to_join\.Args\.p_message: expected optional; generated required/,
    },
    {
      label: "RPC parameter type",
      from: '"p_topic_ids": (string)[] }; Returns: undefined',
      to: '"p_topic_ids": number }; Returns: undefined',
      diagnostic: /Functions\.save_group_topics\.Args\.p_topic_ids: expected string\[\]; generated number/,
    },
    {
      label: "RPC nested return JSON nullability",
      from: '"context": NonNullable<Json>,\n', to: '"context": Json,\n',
      diagnostic: /Functions\.diagnose_recruitment_need\.Returns\.context: expected NonNullable<ExpectedJson>; generated .*Json/,
    },
  ])("rejects $label with the exact contract path and types", ({ from, to, diagnostic }) => {
    expect(generated).toContain(from);
    const directory = mkdtempSync(join(tmpdir(), "nexolab-type-regression-"));
    try {
      const file = join(directory, "database.ts");
      writeFileSync(file, generated.replace(from, to));
      const result = check(file);
      expect(result.status, result.output).toBe(1);
      expect(result.output).toMatch(diagnostic);
      expect(result.output).toContain("TS2344");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
