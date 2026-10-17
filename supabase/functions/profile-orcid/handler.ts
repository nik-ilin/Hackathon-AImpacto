import { normalizeOrcidRecord, parseOrcidId } from "../../../src/features/profiles/import/orcid.ts";

type Dependencies = {
  clientId?: string;
  clientSecret?: string;
  validateUser: (jwt: string) => Promise<boolean>;
  fetch: typeof fetch;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function readLimited(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Respuesta vacía.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Respuesta demasiado grande.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(result);
}

async function externalJson(url: string, init: RequestInit, maxBytes: number, fetcher: typeof fetch): Promise<{ status: number; json: unknown }> {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) return { status: response.status, json: null };
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) throw new Error("Formato ORCID inesperado.");
  return { status: response.status, json: JSON.parse(await readLimited(response, maxBytes)) as unknown };
}

export async function handleProfileOrcidRequest(request: Request, deps: Dependencies): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply(405, { error: "Método no permitido." });
  const match = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "");
  let authenticated = false;
  try {
    if (match) authenticated = await deps.validateUser(match[1]);
  } catch {
    return reply(503, { error: "No se pudo comprobar la sesión. Vuelve a intentarlo." });
  }
  if (!authenticated) {
    return reply(401, { error: "Inicia sesión para importar desde ORCID." });
  }
  let orcidId: string;
  try {
    const body = JSON.parse(await readLimited(new Response(request.body), 1024)) as unknown;
    if (!body || typeof body !== "object" || !("orcidId" in body) || typeof body.orcidId !== "string") {
      return reply(400, { error: "Indica un ORCID iD válido." });
    }
    orcidId = parseOrcidId(body.orcidId);
  } catch {
    return reply(400, { error: "Indica un ORCID iD válido." });
  }
  if (!deps.clientId || !deps.clientSecret) {
    return reply(503, { error: "La importación ORCID no está configurada en el servidor." });
  }

  try {
    const token = await externalJson("https://orcid.org/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: deps.clientId,
        client_secret: deps.clientSecret,
        grant_type: "client_credentials",
        scope: "/read-public",
      }),
    }, 16_384, deps.fetch);
    if (token.status === 429) return reply(429, { error: "ORCID ha limitado temporalmente las consultas." });
    if (token.status === 401 || token.status === 403) return reply(503, { error: "Las credenciales ORCID del servidor no tienen acceso público." });
    if (token.status !== 200) return reply(502, { error: "No se pudo autenticar la consulta pública de ORCID." });
    const accessToken = token.json && typeof token.json === "object" && "access_token" in token.json
      ? token.json.access_token : null;
    if (typeof accessToken !== "string" || !accessToken) throw new Error("Token ORCID ausente.");
    const record = await externalJson(`https://pub.orcid.org/v3.0/${orcidId}/record`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.orcid+json" },
    }, 2_000_000, deps.fetch);
    if (record.status === 404) return reply(404, { error: "No existe un registro público con ese ORCID iD." });
    if (record.status === 429) return reply(429, { error: "ORCID ha limitado temporalmente las consultas." });
    if (record.status === 401 || record.status === 403) return reply(502, { error: "ORCID no permite leer ese registro público." });
    if (record.status !== 200) return reply(502, { error: "ORCID no pudo devolver el registro. Vuelve a intentarlo." });
    return reply(200, normalizeOrcidRecord(record.json, orcidId));
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return reply(504, { error: "ORCID tardó demasiado en responder. Vuelve a intentarlo." });
    }
    return reply(502, { error: "No se pudo leer ORCID. Comprueba la conexión y vuelve a intentarlo." });
  }
}
