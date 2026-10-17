import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleRaulRequest } from "./handler.ts";

Deno.serve((request) =>
  handleRaulRequest(request, {
    triggerToken: Deno.env.get("RAUL_TRIGGER_TOKEN"),
    firecrawlKey: Deno.env.get("FIRECRAWL_API_KEY"),
    fetch,
    createDatabase: () => {
      const url = Deno.env.get("SUPABASE_URL");
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) return null;
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      // Keep the handler contract small instead of exposing all PostgREST generics.
      return {
        rpc: async (name, parameters) => {
          const { data, error } = await client.rpc(name, parameters);
          return { data, error };
        },
        from: (table) => ({
          select: (columns) => ({
            eq: (column, value) => ({
              maybeSingle: async () => {
                const { data, error } = await client
                  .from(table)
                  .select(columns)
                  .eq(column, value)
                  .maybeSingle();
                return { data, error };
              },
            }),
          }),
        }),
      };
    },
  }),
);
