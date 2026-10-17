import { z } from "zod";
import { backend } from "../../lib/supabase/client";

// Domain contract: requirements and declared capabilities are separate from topics.
// A future funding adapter must supply its own requirements and algorithm version.
export const evaluationSchema = z.object({
  required_skills: z.array(z.string()),
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  additional_skills: z.array(z.string()),
  coverage: z.number().min(0).max(1).nullable(),
  matched_topics: z.array(z.string()),
});
const contextSchema = z.object({
  kind: z.literal("recruitment"),
  need_id: z.string(),
  title: z.string(),
  description: z.string(),
  group_id: z.string(),
  group_name: z.string(),
  project_id: z.string().nullable(),
  project_title: z.string().nullable(),
  required_skills: z.array(z.string()),
  declared_skills: z.array(z.string()),
  need_updated_at: z.string(),
});
export const needSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(10000),
  required_skills: z.array(z.string().trim().min(1).max(100)).max(50),
  status: z.enum(["open", "closed"]),
});
export async function listNeeds(page: number) {
  const { data, error } = await backend().from("recruitment_needs")
    .select("*").eq("status", "open").order("created_at", { ascending: false })
    .order("id").range(page * 12, page * 12 + 12);
  if (error) throw error;
  return data;
}
export async function getNeed(id: string) {
  const { data, error } = await backend().from("recruitment_needs").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}
export async function saveNeed(values: z.infer<typeof needSchema>, groupId: string, projectId: string | null, id?: string) {
  const { data, error } = await backend().rpc("save_recruitment_need", {
    p_need_id: id ?? null, p_group_id: groupId, p_project_id: projectId,
    p_title: values.title, p_description: values.description,
    p_required_skills: values.required_skills, p_status: values.status,
  });
  if (error) throw error;
  return data;
}
export async function diagnoseNeed(id: string, impressionKey: string) {
  const { data, error } = await backend().rpc("diagnose_recruitment_need", { p_need_id: id, p_impression_key: impressionKey });
  if (error) throw error;
  return { ...data, context: contextSchema.parse(data.context), evaluation: evaluationSchema.parse(data.evaluation) };
}
export type Diagnosis = Awaited<ReturnType<typeof diagnoseNeed>>;
export async function markShown(id: string) {
  const { error } = await backend().rpc("mark_recommendation_shown", { p_event_id: id });
  if (error) throw error;
}
export async function saveFeedback(id: string, response: "useful" | "not_useful", comment: string) {
  const { error } = await backend().rpc("save_recommendation_feedback", { p_event_id: id, p_response: response, p_comment: comment });
  if (error) throw error;
}
