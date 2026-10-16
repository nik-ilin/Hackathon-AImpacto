import { spawnSync } from "node:child_process";
import { localConfig } from "./local-config.mjs";

const { url, key } = localConfig();
const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      NEXOLAB_E2E_BACKEND: "1",
    },
  },
);
process.exit(result.status ?? 1);
