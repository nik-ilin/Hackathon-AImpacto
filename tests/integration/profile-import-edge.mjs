import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localConfig } from "./local-config.mjs";
import { expectEdgeStatus } from "./edge-diagnostics.mjs";

const { url, key } = localConfig();
const client = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const endpoint = `${url}/functions/v1/profile-orcid`;
const anonymous = await fetch(endpoint, {
  method: "POST",
  headers: { apikey: key, "Content-Type": "application/json" },
  body: JSON.stringify({ orcidId: "0000-0002-1825-0097" }),
});
await expectEdgeStatus(anonymous, [401, 403], "ORCID without JWT");

const { data: registration, error: authError } = await client.auth.signUp({
  email: `import-${randomUUID()}@example.test`,
  password: `Local-${randomUUID()}-9!`,
});
if (authError) throw authError;
assert.ok(
  registration.session,
  "El Auth local debe entregar sesión de prueba.",
);
const headers = {
  apikey: key,
  Authorization: `Bearer ${registration.session.access_token}`,
  "Content-Type": "application/json",
};
const malformed = await fetch(endpoint, {
  method: "POST",
  headers,
  body: JSON.stringify({ orcidId: "0000-0002-1825-0098" }),
});
await expectEdgeStatus(
  malformed,
  400,
  "Authenticated ORCID checksum validation",
);

if (process.env.NEXOLAB_EXPECT_ORCID_UNCONFIGURED === "1") {
  const unconfigured = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ orcidId: "0000-0002-1825-0097" }),
  });
  await expectEdgeStatus(
    unconfigured,
    503,
    "ORCID missing provider credentials",
  );
  assert.match(
    (await unconfigured.json()).error,
    /no está configurada/,
    "A worker boot failure must not pass as missing provider credentials.",
  );
}

const { data: profile, error: profileError } = await client
  .from("profiles")
  .select("id")
  .eq("id", registration.user.id)
  .maybeSingle();
if (profileError) throw profileError;
assert.equal(
  profile,
  null,
  "Consultar ORCID nunca debe crear un perfil automáticamente.",
);
process.stdout.write(
  "Edge ORCID local: Auth real, checksum, configuración explícita y sin escritura automática OK.\n",
);
