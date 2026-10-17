// Curated frontend/server schema contract; CI checks against official local Supabase generated types.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export type Visibility = "public" | "private";
export type AcademicStage =
  "student" | "phd" | "postdoc" | "researcher" | "other";
export type Profile = {
  id: string;
  full_name: string;
  username: string | null;
  institution: string;
  country: string;
  academic_stage: AcademicStage | null;
  bio: string;
  skills: string[];
  orcid_id: string | null;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
};
export type ResearchGroup = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  institution: string;
  country: string;
  visibility: Visibility;
  accepting_members: boolean;
  created_at: string;
  updated_at: string;
};
export type Membership = {
  id: string;
  group_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
};
export type JoinRequest = {
  id: string;
  group_id: string;
  applicant_id: string;
  message: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
};
export type ResearchProject = {
  id: string;
  group_id: string;
  title: string;
  description: string;
  status: "draft" | "active" | "completed";
  funding_needed_amount: number | null;
  funding_currency: string | null;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
};
export type Topic = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
};
export type RecruitmentNeed = {
  id: string;
  group_id: string;
  project_id: string | null;
  title: string;
  description: string;
  required_skills: string[];
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};
export type RecommendationEvent = {
  id: string;
  actor_id: string;
  need_id: string;
  impression_key: string;
  algorithm_version: string;
  context: Json;
  evaluation: Json;
  created_at: string;
  shown_at: string | null;
};
export type RecommendationFeedback = {
  event_id: string;
  actor_id: string;
  response: "useful" | "not_useful";
  comment: string;
  created_at: string;
  updated_at: string;
};
export type OpportunitySource = {
  id: string;
  name: string;
  official_url: string;
  terms_url: string;
  ingestion_method: "api" | "firecrawl";
  frequency_hours: number;
  credits_per_check: number;
  last_reviewed_at: string | null;
  status: "active" | "planned" | "pending_review" | "paused";
  created_at: string;
  updated_at: string;
};
export type Opportunity = {
  id: string;
  source_id: string;
  external_id: string;
  opportunity_type: "scholarship" | "research_internship" | "fellowship" | "research_funding";
  title: string;
  provider: string;
  summary: string;
  official_url: string;
  application_url: string | null;
  bases_url: string | null;
  country: string | null;
  opens_at: string | null;
  official_deadline_date: string | null;
  official_deadline_at: string | null;
  internal_deadline_at: string | null;
  status: "open" | "forthcoming" | "closed" | "unknown" | "pending_review";
  checked_at: string;
  content_hash: string;
  content_version: number;
  provenance: Json;
  created_at: string;
  updated_at: string;
};
export type ScholarshipDetail = {
  opportunity_id: string;
  academic_stages: string[];
  degree_areas: string[];
  residence_requirement: Json;
  amount: Json;
  requirements: Json;
  missing_information: string[];
  updated_at: string;
};
export type FundingDetail = {
  opportunity_id: string;
  funder_type: "public" | "private";
  source_url: string;
  programme: string | null;
  call_identifier: string | null;
  instrument: string | null;
  scope: "local" | "regional" | "national" | "european" | "international";
  regions: string[];
  eligible_beneficiaries: string[];
  beneficiary_notes: string;
  currency: string | null;
  total_budget: number | null;
  min_amount: number | null;
  max_amount: number | null;
  expected_grants: number | null;
  deadline_text: string | null;
  keywords: string[];
  language: string;
  raw: Json;
  updated_at: string;
};
export type JudyRun = {
  id: string; request_id: string; trigger: "cli" | "make" | "schedule" | "test";
  parameters: Json; status: "running" | "completed" | "partial" | "failed";
  lease_token: string; lease_until: string; started_at: string; finished_at: string | null;
  created_count: number; updated_count: number; unchanged_count: number;
  stats: Json; errors: Json; skipped: Json;
};
export type JudyRunBatch = {
  run_id: string; batch_key: string; payload_hash: string;
  created_count: number; updated_count: number; unchanged_count: number; recorded_at: string;
};
export type OpportunityVersion = {
  opportunity_id: string;
  version: number;
  content_hash: string;
  snapshot: Json;
  checked_at: string;
  created_at: string;
};
export type RaulRun = {
  id: string;
  request_key: string;
  mode: "incremental";
  max_sources: number;
  status: "running" | "completed" | "partial" | "failed";
  sources_reviewed: number;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  discarded_count: number;
  error_count: number;
  credits_estimated: number;
  credits_measured: number | null;
  duration_ms: number | null;
  error_codes: string[];
  started_at: string;
  finished_at: string | null;
  lease_until: string;
};
export type RaulSourceRun = {
  run_id: string;
  source_id: string;
  status: "completed" | "failed" | "skipped";
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  discarded_count: number;
  error_code: string | null;
  credits_estimated: number;
  credits_measured: number | null;
  duration_ms: number;
  recorded_at: string;
};
type Relation<
  Name extends string,
  Column extends string,
  Target extends string,
  IsOne extends boolean = false,
> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: IsOne;
  referencedRelation: Target;
  referencedColumns: ["id"];
};
type Table<Row, Required extends keyof Row, Relationships extends unknown[]> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: Relationships;
};
export type Database = {
  public: {
    Tables: {
      opportunity_sources: Table<OpportunitySource, "id" | "name" | "official_url" | "terms_url" | "ingestion_method" | "frequency_hours" | "status", []>;
      opportunities: Table<Opportunity, "source_id" | "external_id" | "opportunity_type" | "title" | "provider" | "official_url" | "status" | "checked_at" | "content_hash" | "provenance", [Relation<"opportunities_source_id_fkey", "source_id", "opportunity_sources">]>;
      judy_runs: Table<JudyRun, "request_id" | "trigger" | "parameters", []>;
      judy_run_batches: Table<JudyRunBatch, "run_id" | "batch_key" | "payload_hash" | "created_count" | "updated_count" | "unchanged_count", [Relation<"judy_run_batches_run_id_fkey", "run_id", "judy_runs">]>;
      funding_details: Table<FundingDetail, "opportunity_id" | "funder_type" | "source_url" | "scope", [Relation<"funding_details_opportunity_id_fkey", "opportunity_id", "opportunities", true>]>;
      scholarship_details: Table<ScholarshipDetail, "opportunity_id", [Relation<"scholarship_details_opportunity_id_fkey", "opportunity_id", "opportunities", true>]>;
      opportunity_versions: Table<OpportunityVersion, "opportunity_id" | "version" | "content_hash" | "snapshot" | "checked_at", [Relation<"opportunity_versions_opportunity_id_fkey", "opportunity_id", "opportunities">]>;
      raul_runs: Table<RaulRun, "request_key" | "mode" | "max_sources", []>;
      raul_source_runs: Table<RaulSourceRun, "run_id" | "source_id" | "status" | "duration_ms", [Relation<"raul_source_runs_run_id_fkey", "run_id", "raul_runs">, Relation<"raul_source_runs_source_id_fkey", "source_id", "opportunity_sources">]>;
      recruitment_needs: Table<RecruitmentNeed, "group_id" | "title", [
        Relation<"recruitment_needs_group_id_fkey", "group_id", "research_groups">,
        { foreignKeyName: "recruitment_needs_project_id_group_id_fkey"; columns: ["project_id", "group_id"]; isOneToOne: false; referencedRelation: "research_projects"; referencedColumns: ["id", "group_id"] }
      ]>;
      recommendation_events: Table<RecommendationEvent, "actor_id" | "need_id" | "impression_key" | "algorithm_version" | "context" | "evaluation", [
        Relation<"recommendation_events_actor_id_fkey", "actor_id", "profiles">,
        Relation<"recommendation_events_need_id_fkey", "need_id", "recruitment_needs">
      ]>;
      recommendation_feedback: Table<RecommendationFeedback, "event_id" | "actor_id" | "response", [
        { foreignKeyName: "recommendation_feedback_event_id_actor_id_fkey"; columns: ["event_id", "actor_id"]; isOneToOne: true; referencedRelation: "recommendation_events"; referencedColumns: ["id", "actor_id"] },
        Relation<"recommendation_feedback_actor_id_fkey", "actor_id", "profiles">
      ]>;
      profiles: Table<Profile, "id" | "full_name", []>;
      research_groups: Table<
        ResearchGroup,
        "owner_id" | "name",
        [Relation<"research_groups_owner_id_fkey", "owner_id", "profiles">]
      >;
      group_memberships: Table<
        Membership,
        "group_id" | "user_id",
        [
          Relation<
            "group_memberships_group_id_fkey",
            "group_id",
            "research_groups"
          >,
          Relation<"group_memberships_user_id_fkey", "user_id", "profiles">,
        ]
      >;
      group_join_requests: Table<
        JoinRequest,
        "group_id" | "applicant_id",
        [
          Relation<
            "group_join_requests_group_id_fkey",
            "group_id",
            "research_groups"
          >,
          Relation<
            "group_join_requests_applicant_id_fkey",
            "applicant_id",
            "profiles"
          >,
          Relation<
            "group_join_requests_decided_by_fkey",
            "decided_by",
            "profiles"
          >,
        ]
      >;
      research_projects: Table<
        ResearchProject,
        "group_id" | "title",
        [
          Relation<
            "research_projects_group_id_fkey",
            "group_id",
            "research_groups"
          >,
        ]
      >;
      topics: Table<
        Topic,
        "slug" | "name",
        [Relation<"topics_parent_id_fkey", "parent_id", "topics">]
      >;
      profile_topics: Table<
        { profile_id: string; topic_id: string },
        "profile_id" | "topic_id",
        [
          Relation<"profile_topics_profile_id_fkey", "profile_id", "profiles">,
          Relation<"profile_topics_topic_id_fkey", "topic_id", "topics">,
        ]
      >;
      group_topics: Table<
        { group_id: string; topic_id: string },
        "group_id" | "topic_id",
        [
          Relation<"group_topics_group_id_fkey", "group_id", "research_groups">,
          Relation<"group_topics_topic_id_fkey", "topic_id", "topics">,
        ]
      >;
      project_topics: Table<
        { project_id: string; topic_id: string },
        "project_id" | "topic_id",
        [
          Relation<
            "project_topics_project_id_fkey",
            "project_id",
            "research_projects"
          >,
          Relation<"project_topics_topic_id_fkey", "topic_id", "topics">,
        ]
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      judy_begin_run: { Args: { p_request_id: string; p_trigger: string; p_parameters: Json }; Returns: Json };
      judy_upsert_opportunities: { Args: { p_run_id: string; p_lease_token: string; p_batch_key: string; p_items: Json }; Returns: Json };
      judy_finish_run: { Args: { p_run_id: string; p_lease_token: string; p_report: Json }; Returns: Json };
      judy_get_run: { Args: { p_request_id: string }; Returns: Json };
      judy_renew_run: { Args: { p_run_id: string; p_lease_token: string }; Returns: Json };
      raul_expire_run: { Args: { p_run_id: string }; Returns: Json };
      raul_fail_run: { Args: { p_run_id: string; p_error_code: string }; Returns: Json };
      raul_begin_run: { Args: { p_request_key: string; p_mode: "incremental"; p_max_sources: number }; Returns: Json };
      raul_upsert_opportunity: { Args: { p_run_id: string; p_source_id: string; p_external_id: string; p_data: Json; p_duration_ms: number; p_credits_estimated: number; p_credits_measured: number | null }; Returns: Json };
      raul_record_source_result: { Args: { p_run_id: string; p_source_id: string; p_status: "completed" | "failed" | "skipped"; p_created: number; p_updated: number; p_unchanged: number; p_discarded: number; p_error_code: string | null; p_credits_estimated: number; p_credits_measured: number | null; p_duration_ms: number }; Returns: undefined };
      raul_finish_run: { Args: { p_run_id: string; p_status: "completed" | "partial" | "failed" }; Returns: Json };
      save_recruitment_need: {
        Args: { p_need_id: string | null; p_group_id: string; p_project_id: string | null; p_title: string; p_description: string; p_required_skills: string[]; p_status: "open" | "closed" };
        Returns: string;
      };
      diagnose_recruitment_need: {
        Args: { p_need_id: string; p_impression_key: string };
        Returns: RecommendationEvent;
      };
      mark_recommendation_shown: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      save_recommendation_feedback: {
        Args: { p_event_id: string; p_response: "useful" | "not_useful"; p_comment: string };
        Returns: undefined;
      };
      request_to_join: {
        Args: { p_group_id: string; p_message?: string | null };
        Returns: JoinRequest;
      };
      decide_join_request: {
        Args: { p_request_id: string; p_decision: "approved" | "rejected" };
        Returns: JoinRequest;
      };
      cancel_join_request: {
        Args: { p_request_id: string };
        Returns: JoinRequest;
      };
      save_profile_topics: {
        Args: { p_topic_ids: string[] };
        Returns: undefined;
      };
      save_group_topics: {
        Args: { p_group_id: string; p_topic_ids: string[] };
        Returns: undefined;
      };
      save_project_topics: {
        Args: { p_project_id: string; p_topic_ids: string[] };
        Returns: undefined;
      };
      upsert_profile: {
        Args: {
          p_full_name: string;
          p_username: string | null;
          p_institution: string | null;
          p_country: string | null;
          p_academic_stage: AcademicStage | null;
          p_bio: string | null;
          p_skills: string[];
          p_orcid_id: string | null;
          p_visibility: Visibility;
          p_topic_ids: string[];
        };
        Returns: undefined;
      };
      save_research_group: {
        Args: {
          p_group_id: string | null;
          p_name: string;
          p_description: string | null;
          p_institution: string | null;
          p_country: string | null;
          p_visibility: Visibility;
          p_accepting_members: boolean;
          p_topic_ids: string[];
        };
        Returns: string;
      };
      save_research_project: {
        Args: {
          p_project_id: string | null;
          p_group_id: string;
          p_title: string;
          p_description: string | null;
          p_status: "draft" | "active" | "completed";
          p_funding_needed_amount: number | null;
          p_funding_currency: string | null;
          p_visibility: Visibility;
          p_topic_ids: string[];
        };
        Returns: string;
      };
      discover_groups: {
        Args: {
          p_search?: string | null;
          p_topic_id?: string | null;
          p_accepting?: boolean | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: (ResearchGroup & {
          matched_topics: string[];
          match_count: number;
        })[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
