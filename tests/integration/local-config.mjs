import { execFileSync } from "node:child_process";

export function localConfig() {
  let url = process.env.NEXOLAB_TEST_URL;
  let key = process.env.NEXOLAB_TEST_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Read only the public URL/key properties. Never print CLI status or private keys.
    const cli = "node_modules/supabase/dist/supabase.js";
    let status;
    try {
      status = JSON.parse(
        execFileSync(process.execPath, [cli, "status", "--output", "json"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    } catch {
      throw new Error(
        "Supabase local no disponible. Inicia Docker y ejecuta npm run db:start; no se ha ejecutado esta prueba.",
      );
    }
    url ??= status.API_URL;
    key ??= status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  }
  if (!url || !key)
    throw new Error("Faltan URL y clave pública de Supabase local.");
  const endpoint = new URL(url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) {
    throw new Error(
      "Estas pruebas crean datos y solo admiten Supabase en loopback. No se permite un backend remoto.",
    );
  }
  if (key.startsWith("sb_secret_"))
    throw new Error("Usa una clave pública, nunca una clave secreta.");
  if (key.split(".").length === 3) {
    const claims = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    );
    if (claims.role !== "anon")
      throw new Error("La clave JWT debe ser anon, nunca service_role.");
  }
  return { url, key };
}
