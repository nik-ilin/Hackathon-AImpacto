import { z } from "zod";
import type { Tables } from "../../types/database";
import { backend } from "./client";
import { mutationSession, type MutationIdentity } from "./identity";

export const catalogFiltersSchema = z.object({
  page: z.number().int().min(0).max(10000).default(0),
  pageSize: z.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(200).default(""),
  type: z.enum(["scholarship", "research_internship", "fellowship", "research_funding"]).optional(),
  sourceId: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/).optional(),
  country: z.string().trim().max(100).optional(),
  status: z.enum(["open", "forthcoming"]).optional(),
});
export type CatalogFilters = z.input<typeof catalogFiltersSchema>;
export type CatalogPage = { items: Tables<"opportunities">[]; page: number; pageSize: number; hasMore: boolean };
export type OpportunityDetail = {
  opportunity: Tables<"opportunities">;
  source: Tables<"opportunity_sources"> | null;
  scholarship: Tables<"scholarship_details"> | null;
  funding: Tables<"funding_details"> | null;
};

function assertCurrent(identity: MutationIdentity) {
  if (!identity.isCurrent()) throw new Error("La cuenta ha cambiado. Vuelve a cargar el catálogo.");
}

/** Authenticated catalog. RLS also enforces active source, freshness and deadlines. */
export async function listOpportunities(filters: CatalogFilters, identity: MutationIdentity): Promise<CatalogPage> {
  const selected = catalogFiltersSchema.parse(filters);
  const session = await mutationSession(identity);
  let query = backend().from("opportunities").select("*")
    .order("official_deadline_at", { ascending: true, nullsFirst: false })
    .order("id")
    .range(selected.page * selected.pageSize, (selected.page + 1) * selected.pageSize);
  if (selected.type) query = query.eq("opportunity_type", selected.type);
  if (selected.sourceId) query = query.eq("source_id", selected.sourceId);
  if (selected.country) query = query.eq("country", selected.country);
  if (selected.status) query = query.eq("status", selected.status);
  if (selected.search) query = query.ilike("title", `%${selected.search.replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error } = await query.setHeader("Authorization", `Bearer ${session.access_token}`);
  assertCurrent(identity);
  if (error) throw error;
  return { items: data.slice(0, selected.pageSize), page: selected.page, pageSize: selected.pageSize, hasMore: data.length > selected.pageSize };
}

/** null means absent or hidden by RLS; never disclose which case occurred. */
export async function getOpportunityDetail(id: string, identity: MutationIdentity): Promise<OpportunityDetail | null> {
  z.uuid().parse(id);
  const session = await mutationSession(identity);
  const authorization = `Bearer ${session.access_token}`;
  const opportunity = await backend().from("opportunities").select("*").eq("id", id).maybeSingle().setHeader("Authorization", authorization);
  assertCurrent(identity);
  if (opportunity.error) throw opportunity.error;
  if (!opportunity.data) return null;
  const [source, scholarship, funding] = await Promise.all([
    backend().from("opportunity_sources").select("*").eq("id", opportunity.data.source_id).maybeSingle().setHeader("Authorization", authorization),
    backend().from("scholarship_details").select("*").eq("opportunity_id", id).maybeSingle().setHeader("Authorization", authorization),
    backend().from("funding_details").select("*").eq("opportunity_id", id).maybeSingle().setHeader("Authorization", authorization),
  ]);
  assertCurrent(identity);
  if (source.error) throw source.error;
  if (scholarship.error) throw scholarship.error;
  if (funding.error) throw funding.error;
  return { opportunity: opportunity.data, source: source.data, scholarship: scholarship.data, funding: funding.data };
}
