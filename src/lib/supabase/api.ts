import type { Tables } from "../../types/database";
import type { z } from "zod";
import type {
  groupSchema,
  profileSchema,
  projectSchema,
} from "../validation/schemas";
import { backend } from "./client";
import {
  mutationSession,
  sessionForUser,
  type MutationIdentity,
} from "./identity";

export async function getTopics() {
  const { data, error } = await backend()
    .from("topics")
    .select("*")
    .order("name");
  if (error) throw error;
  return data;
}
export async function getProfile(id: string) {
  const { data, error } = await backend()
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function getProfileTopics(id: string) {
  const { data, error } = await backend()
    .from("profile_topics")
    .select("topic_id")
    .eq("profile_id", id);
  if (error) throw error;
  return data.map((row) => row.topic_id);
}
export async function saveProfile(
  values: z.infer<typeof profileSchema>,
  topicIds: string[],
  identity: MutationIdentity,
) {
  const session = await mutationSession(identity);
  const { error } = await backend()
    .rpc("upsert_profile", {
      p_full_name: values.full_name,
      p_username: values.username || null,
      p_institution: values.institution || null,
      p_country: values.country || null,
      p_academic_stage: values.academic_stage || null,
      p_bio: values.bio || null,
      p_skills: values.skills
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      p_orcid_id: values.orcid_id || null,
      p_visibility: values.visibility,
      p_topic_ids: topicIds,
    })
    .setHeader("Authorization", `Bearer ${session.access_token}`);
  if (error) throw error;
}
export async function discoverGroups(
  userId: string,
  search = "",
  topicId: string | null = null,
  accepting: boolean | null = null,
  offset = 0,
  limit = 12,
) {
  const session = await sessionForUser(userId);
  const { data, error } = await backend()
    .rpc("discover_groups", {
      p_search: search || null,
      p_topic_id: topicId,
      p_accepting: accepting,
      p_limit: limit,
      p_offset: offset,
    })
    .setHeader("Authorization", `Bearer ${session.access_token}`);
  if (error) throw error;
  return data;
}
export async function getGroup(id: string) {
  const { data, error } = await backend()
    .from("research_groups")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
export async function getGroupTopics(id: string) {
  const { data, error } = await backend()
    .from("group_topics")
    .select("topic_id")
    .eq("group_id", id);
  if (error) throw error;
  return data.map((row) => row.topic_id);
}
export async function getGroupMembers(id: string, page = 0) {
  const { data, error } = await backend()
    .from("group_memberships")
    .select("*")
    .eq("group_id", id)
    .order("joined_at")
    .order("id")
    .range(page * 8, page * 8 + 8);
  if (error) throw error;
  return data;
}
export async function getVisibleProfiles(ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await backend()
    .from("profiles")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  return data;
}
export async function getGroupProjects(id: string, page = 0) {
  const { data, error } = await backend()
    .from("research_projects")
    .select("*")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 8, page * 8 + 8);
  if (error) throw error;
  return data;
}
export async function getGroupRequest(groupId: string, userId: string) {
  const { data, error } = await backend()
    .from("group_join_requests")
    .select("*")
    .eq("group_id", groupId)
    .eq("applicant_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function saveGroup(
  values: z.infer<typeof groupSchema>,
  topicIds: string[],
  identity: MutationIdentity,
  id?: string,
) {
  const session = await mutationSession(identity, !id);
  const { data, error } = await backend()
    .rpc("save_research_group", {
      p_group_id: id ?? null,
      p_name: values.name,
      p_description: values.description,
      p_institution: values.institution || null,
      p_country: values.country || null,
      p_visibility: values.visibility,
      p_accepting_members: values.accepting_members,
      p_topic_ids: topicIds,
    })
    .setHeader("Authorization", `Bearer ${session.access_token}`);
  if (error) throw error;
  return data;
}
export async function getMyGroups(userId: string, page = 0) {
  const [owned, membership] = await Promise.all([
    backend()
      .from("research_groups")
      .select("*", { count: "exact" })
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 12, page * 12 + 11),
    backend()
      .from("group_memberships")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .order("id")
      .range(page * 12, page * 12 + 11),
  ]);
  if (owned.error) throw owned.error;
  if (membership.error) throw membership.error;
  let joined: Tables<"research_groups">[] = [];
  if (membership.data.length) {
    const result = await backend()
      .from("research_groups")
      .select("*")
      .in(
        "id",
        membership.data.map((row) => row.group_id),
      );
    if (result.error) throw result.error;
    joined = membership.data.flatMap((member) =>
      result.data.filter((group) => group.id === member.group_id),
    );
  }
  return {
    owned: owned.data,
    joined,
    memberships: membership.data,
    ownedTotal: owned.count ?? 0,
    joinedTotal: membership.count ?? 0,
  };
}
export async function getOwnMembership(groupId: string, userId: string) {
  const { data, error } = await backend()
    .from("group_memberships")
    .select("*")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function requestToJoin(
  groupId: string,
  message: string,
  identity: MutationIdentity,
) {
  const session = await mutationSession(identity, true);
  const { error } = await backend()
    .rpc("request_to_join", {
      p_group_id: groupId,
      p_message: message || null,
    })
    .setHeader("Authorization", `Bearer ${session.access_token}`);
  if (error) throw error;
}
export async function decideRequest(
  requestId: string,
  decision: "approved" | "rejected",
  identity: MutationIdentity,
) {
  const session = await mutationSession(identity);
  const { error } = await backend()
    .rpc("decide_join_request", {
      p_request_id: requestId,
      p_decision: decision,
    })
    .setHeader("Authorization", `Bearer ${session.access_token}`);
  if (error) throw error;
}
export async function cancelRequest(
  requestId: string,
  identity: MutationIdentity,
) {
  const session = await mutationSession(identity);
  const { error } = await backend()
    .rpc("cancel_join_request", {
      p_request_id: requestId,
    })
    .setHeader("Authorization", `Bearer ${session.access_token}`);
  if (error) throw error;
}
export async function getRequests(userId: string, page = 0) {
  const sent = await backend()
    .from("group_join_requests")
    .select("*")
    .eq("applicant_id", userId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 12, page * 12 + 12);
  if (sent.error) throw sent.error;
  // RLS returns only requests owned by this user or managed by their group relation.
  const inbox = await backend()
    .from("group_join_requests")
    .select("*")
    .neq("applicant_id", userId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 12, page * 12 + 12);
  if (inbox.error) throw inbox.error;
  const received = inbox.data;
  const names = await getVisibleProfiles(
    received.map((request) => request.applicant_id),
  );
  const groupIds = [
    ...new Set([...sent.data, ...received].map((request) => request.group_id)),
  ];
  let visibleGroups: Tables<"research_groups">[] = [];
  if (groupIds.length) {
    const result = await backend()
      .from("research_groups")
      .select("*")
      .in("id", groupIds);
    if (result.error) throw result.error;
    visibleGroups = result.data;
  }
  return { sent: sent.data, received, profiles: names, groups: visibleGroups };
}
export async function getProject(id: string) {
  const { data, error } = await backend()
    .from("research_projects")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
export async function getProjectTopics(id: string) {
  const { data, error } = await backend()
    .from("project_topics")
    .select("topic_id")
    .eq("project_id", id);
  if (error) throw error;
  return data.map((row) => row.topic_id);
}
export async function saveProject(
  values: z.infer<typeof projectSchema>,
  topicIds: string[],
  groupId: string,
  identity: MutationIdentity,
  id?: string,
) {
  const session = await mutationSession(identity);
  const { data, error } = await backend()
    .rpc("save_research_project", {
      p_project_id: id ?? null,
      p_group_id: groupId,
      p_title: values.title,
      p_description: values.description,
      p_status: values.status,
      p_visibility: values.visibility,
      p_funding_needed_amount:
        values.funding_needed_amount === ""
          ? null
          : Number(values.funding_needed_amount),
      p_funding_currency: values.funding_currency || null,
      p_topic_ids: topicIds,
    })
    .setHeader("Authorization", `Bearer ${session.access_token}`);
  if (error) throw error;
  return data;
}
