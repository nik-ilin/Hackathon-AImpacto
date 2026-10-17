import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { localConfig } from "./local-config.mjs";

const { url, key } = localConfig();
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const endpoint = `${url}/functions/v1/profile-orcid`;
const anonymous = await fetch(endpoint, {
  method: "POST",
  headers: { apikey: key, "Content-Type": "application/json" },
  body: JSON.stringify({ orcidId: "0000-0002-1825-0097" }),
});
assert.ok([401, 403].includes(anonymous.status), `Una llamada sin JWT debe rechazarse; recibida ${anonymous.status}`);

const { data: registration, error: authError } = await client.auth.signUp({
  email: `import-${randomUUID()}@example.test`,
  password: `Local-${randomUUID()}-9!`,
});
if (authError) throw authError;
assert.ok(registration.session, "El Auth local debe entregar sesión de prueba.");
const headers = {
  apikey: key,
  Authorization: `Bearer ${registration.session.access_token}`,
  "Content-Type": "application/json",
};
const malformed = await fetch(endpoint, {
  method: "POST", headers,
  body: JSON.stringify({ orcidId: "0000-0002-1825-0098" }),
});
assert.equal(malformed.status, 400, "El Edge real debe rechazar un checksum ORCID inválido tras autenticar al usuario.");

if (process.env.NEXOLAB_EXPECT_ORCID_UNCONFIGURED === "1") {
  const unconfigured = await fetch(endpoint, {
    method: "POST", headers,
    body: JSON.stringify({ orcidId: "0000-0002-1825-0097" }),
  });
  assert.equal(unconfigured.status, 503, "Sin secretos ORCID en CI, la función debe informar configuración ausente.");
}

const { data: profile, error: profileError } = await client.from("profiles").select("id").eq("id", registration.user.id).maybeSingle();
if (profileError) throw profileError;
assert.equal(profile, null, "Consultar ORCID nunca debe crear un perfil automáticamente.");
process.stdout.write("Edge ORCID local: Auth real, checksum, configuración explícita y sin escritura automática OK.\n");
