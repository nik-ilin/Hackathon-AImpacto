export type BackendConfig = { url: string; key: string };
export function parseBackendConfig(
  url: unknown,
  key: unknown,
): { config: BackendConfig | null; error: string | null } {
  if (!url || !key)
    return {
      config: null,
      error:
        "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY. Consulta la guía de configuración.",
    };
  if (typeof url !== "string" || typeof key !== "string")
    return {
      config: null,
      error: "La configuración de Supabase no es válida.",
    };
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    return {
      config: null,
      error: "VITE_SUPABASE_URL debe ser una URL HTTP o HTTPS válida.",
    };
  }
  if (key.startsWith("sb_secret_"))
    return {
      config: null,
      error:
        "Una clave secreta nunca debe configurarse en el navegador. Usa la clave publicable.",
    };
  if (!key.startsWith("sb_publishable_")) {
    try {
      const payload = JSON.parse(
        atob(key.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
      ) as { role?: string };
      if (payload.role !== "anon") throw new Error();
    } catch {
      return {
        config: null,
        error:
          "Usa una clave publicable de Supabase o una clave anon válida; las claves privilegiadas están prohibidas.",
      };
    }
  }
  return { config: { url, key }, error: null };
}
