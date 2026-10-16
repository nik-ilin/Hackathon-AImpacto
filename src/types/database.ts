// M1 schema contract. Regenerate with npm run db:types after starting Supabase locally.
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
