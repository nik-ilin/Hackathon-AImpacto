import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { parseBackendConfig } from "./config";

const parsed = parseBackendConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const configurationError = parsed.error;
export const supabase = parsed.config
  ? createClient<Database>(parsed.config.url, parsed.config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export function backend() {
  if (!supabase)
    throw new Error(configurationError ?? "Configura Supabase para continuar.");
  return supabase;
}
