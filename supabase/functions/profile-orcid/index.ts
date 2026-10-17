import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleProfileOrcidRequest } from "./handler.ts";

Deno.serve((request) => handleProfileOrcidRequest(request, {
  clientId: Deno.env.get("ORCID_CLIENT_ID"),
  clientSecret: Deno.env.get("ORCID_CLIENT_SECRET"),
  fetch,
  validateUser: async (jwt) => {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !key) return false;
    const { data, error } = await createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.getUser(jwt);
    return !error && Boolean(data.user);
  },
}));
