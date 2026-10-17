import { backend } from "../../lib/supabase/client";
import { getProfile } from "../../lib/supabase/api";
import type { Tables } from "../../types/database";

export type ScholarshipRecord = {
  opportunity: Tables<"opportunities">;
  details: Tables<"scholarship_details">;
  source: Tables<"opportunity_sources"> | null;
};

export function todayInMadrid(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (name: string) => parts.find((part) => part.type === name)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function getOpenScholarships(userId: string): Promise<{
  items: ScholarshipRecord[];
  profile: Tables<"profiles"> | null;
}> {
  const today = todayInMadrid();
  const [opportunities, profile] = await Promise.all([
    backend()
      .from("opportunities")
      .select("*")
      .in("opportunity_type", ["scholarship", "research_internship", "fellowship"])
      .eq("status", "open")
      .gte("official_deadline_date", today)
      .order("official_deadline_date", { ascending: true })
      .limit(30),
    getProfile(userId),
  ]);
  if (opportunities.error) throw opportunities.error;
  if (!opportunities.data.length) return { items: [], profile };
  const [details, sources] = await Promise.all([
    backend()
      .from("scholarship_details")
      .select("*")
      .in("opportunity_id", opportunities.data.map((item) => item.id)),
    backend()
      .from("opportunity_sources")
      .select("*")
      .in("id", [...new Set(opportunities.data.map((item) => item.source_id))]),
  ]);
  if (details.error) throw details.error;
  if (sources.error) throw sources.error;
  const byId = new Map(details.data.map((detail) => [detail.opportunity_id, detail]));
  const sourcesById = new Map(sources.data.map((source) => [source.id, source]));
  return {
    items: opportunities.data.flatMap((opportunity) => {
      const detail = byId.get(opportunity.id);
      return detail ? [{ opportunity, details: detail, source: sourcesById.get(opportunity.source_id) ?? null }] : [];
    }),
    profile,
  };
}
