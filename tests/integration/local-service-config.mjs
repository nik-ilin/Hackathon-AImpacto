import { execFileSync } from "node:child_process";
import { localConfig } from "./local-config.mjs";

export function assertLoopbackApi(value) {
  const endpoint = new URL(value);
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    endpoint.pathname !== "/"
  ) {
    throw new Error("Las pruebas privilegiadas solo admiten una API Supabase local en loopback.");
  }
  return endpoint;
}

// This helper is test-only. A privileged key never comes from VITE or a remote
// project: retrieve the running local CLI stack after checking its API endpoint.
export function localServiceConfig() {
  const { url, key } = localConfig();
  const endpoint = assertLoopbackApi(url);
  let status;
  try {
    status = JSON.parse(execFileSync(process.execPath, [
      "node_modules/supabase/dist/supabase.js", "status", "--output", "json",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch {
    throw new Error("Supabase local no disponible: inicia Docker y ejecuta npm run db:start. Prueba no ejecutada.");
  }
  const localEndpoint = assertLoopbackApi(status.API_URL);
  if (endpoint.origin !== localEndpoint.origin) {
    throw new Error("La API de prueba debe coincidir con la instancia local de la CLI.");
  }
  const serviceKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  if (typeof serviceKey !== "string" || !serviceKey) {
    throw new Error("La CLI local no proporciona una clave de servidor para la prueba.");
  }
  return { url, key, serviceKey };
}
