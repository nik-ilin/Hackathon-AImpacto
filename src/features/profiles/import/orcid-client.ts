import { backend } from "../../../lib/supabase/client";
import { parseOrcidId } from "./orcid-id";
import type { ProfileImportData } from "./orcid";

export async function fetchOrcidImport(
  input: string,
  signal?: AbortSignal,
): Promise<ProfileImportData> {
  const orcidId = parseOrcidId(input);
  const { data, error } = await backend().functions.invoke<ProfileImportData>(
    "profile-orcid",
    { body: { orcidId }, signal },
  );
  if (error) {
    if (signal?.aborted) throw new DOMException("Carga cancelada.", "AbortError");
    const response = error.context;
    if (response instanceof Response) {
      const payload: unknown = await response.json().catch(() => null);
      if (
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
      ) {
        throw new Error(payload.error);
      }
    }
    throw new Error("No se pudo consultar ORCID. Vuelve a intentarlo.");
  }
  if (!data || data.source !== "ORCID" || !data.fields || data.fields.orcid_id !== orcidId) {
    throw new Error("ORCID devolvió una respuesta inesperada.");
  }
  return data;
}
