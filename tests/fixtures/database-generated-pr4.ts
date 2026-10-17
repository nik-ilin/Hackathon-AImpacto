
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "funding_details": {
                  Row: {
                    "beneficiary_notes": string,"call_identifier": string | null,"currency": string | null,"deadline_text": string | null,"eligible_beneficiaries": (string)[],"expected_grants": number | null,"funder_type": string,"instrument": string | null,"keywords": (string)[],"language": string,"max_amount": number | null,"min_amount": number | null,"opportunity_id": string,"programme": string | null,"raw": NonNullable<Json>,"regions": (string)[],"scope": string,"source_url": string,"total_budget": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "beneficiary_notes"?: string,"call_identifier"?: string | null,"currency"?: string | null,"deadline_text"?: string | null,"eligible_beneficiaries"?: (string)[],"expected_grants"?: number | null,"funder_type": string,"instrument"?: string | null,"keywords"?: (string)[],"language"?: string,"max_amount"?: number | null,"min_amount"?: number | null,"opportunity_id": string,"programme"?: string | null,"raw"?: NonNullable<Json>,"regions"?: (string)[],"scope": string,"source_url": string,"total_budget"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "beneficiary_notes"?: string,"call_identifier"?: string | null,"currency"?: string | null,"deadline_text"?: string | null,"eligible_beneficiaries"?: (string)[],"expected_grants"?: number | null,"funder_type"?: string,"instrument"?: string | null,"keywords"?: (string)[],"language"?: string,"max_amount"?: number | null,"min_amount"?: number | null,"opportunity_id"?: string,"programme"?: string | null,"raw"?: NonNullable<Json>,"regions"?: (string)[],"scope"?: string,"source_url"?: string,"total_budget"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "funding_details_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: true
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    }
                  ]
                },"group_join_requests": {
                  Row: {
                    "applicant_id": string,"created_at": string,"decided_at": string | null,"decided_by": string | null,"group_id": string,"id": string,"message": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applicant_id": string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"group_id": string,"id"?: string,"message"?: string | null,"status"?: string
                  }
                  Update: {
                    "applicant_id"?: string,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"group_id"?: string,"id"?: string,"message"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_join_requests_applicant_id_fkey"
      columns: ["applicant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_join_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_join_requests_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "research_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"group_memberships": {
                  Row: {
                    "group_id": string,"id": string,"joined_at": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"id"?: string,"joined_at"?: string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"id"?: string,"joined_at"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_memberships_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "research_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_topics": {
                  Row: {
                    "group_id": string,"topic_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"topic_id": string
                  }
                  Update: {
                    "group_id"?: string,"topic_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_topics_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "research_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_topics_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"judy_run_batches": {
                  Row: {
                    "batch_key": string,"created_count": number,"payload_hash": string,"recorded_at": string,"run_id": string,"unchanged_count": number,"updated_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_key": string,"created_count": number,"payload_hash": string,"recorded_at"?: string,"run_id": string,"unchanged_count": number,"updated_count": number
                  }
                  Update: {
                    "batch_key"?: string,"created_count"?: number,"payload_hash"?: string,"recorded_at"?: string,"run_id"?: string,"unchanged_count"?: number,"updated_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "judy_run_batches_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "judy_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"judy_runs": {
                  Row: {
                    "created_count": number,"errors": NonNullable<Json>,"finished_at": string | null,"id": string,"lease_token": string,"lease_until": string,"parameters": NonNullable<Json>,"request_id": string,"skipped": NonNullable<Json>,"started_at": string,"stats": NonNullable<Json>,"status": string,"trigger": string,"unchanged_count": number,"updated_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_count"?: number,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"lease_token"?: string,"lease_until"?: string,"parameters": NonNullable<Json>,"request_id": string,"skipped"?: NonNullable<Json>,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: string,"trigger": string,"unchanged_count"?: number,"updated_count"?: number
                  }
                  Update: {
                    "created_count"?: number,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"lease_token"?: string,"lease_until"?: string,"parameters"?: NonNullable<Json>,"request_id"?: string,"skipped"?: NonNullable<Json>,"started_at"?: string,"stats"?: NonNullable<Json>,"status"?: string,"trigger"?: string,"unchanged_count"?: number,"updated_count"?: number
                  }
                  Relationships: [
                    
                  ]
                },"opportunities": {
                  Row: {
                    "application_url": string | null,"bases_url": string | null,"checked_at": string,"content_hash": string,"content_version": number,"country": string | null,"created_at": string,"external_id": string,"id": string,"internal_deadline_at": string | null,"official_deadline_at": string | null,"official_deadline_date": string | null,"official_url": string,"opens_at": string | null,"opportunity_type": string,"provenance": NonNullable<Json>,"provider": string,"source_id": string,"status": string,"summary": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_url"?: string | null,"bases_url"?: string | null,"checked_at": string,"content_hash": string,"content_version"?: number,"country"?: string | null,"created_at"?: string,"external_id": string,"id"?: string,"internal_deadline_at"?: string | null,"official_deadline_at"?: string | null,"official_deadline_date"?: string | null,"official_url": string,"opens_at"?: string | null,"opportunity_type": string,"provenance": NonNullable<Json>,"provider": string,"source_id": string,"status": string,"summary"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "application_url"?: string | null,"bases_url"?: string | null,"checked_at"?: string,"content_hash"?: string,"content_version"?: number,"country"?: string | null,"created_at"?: string,"external_id"?: string,"id"?: string,"internal_deadline_at"?: string | null,"official_deadline_at"?: string | null,"official_deadline_date"?: string | null,"official_url"?: string,"opens_at"?: string | null,"opportunity_type"?: string,"provenance"?: NonNullable<Json>,"provider"?: string,"source_id"?: string,"status"?: string,"summary"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunities_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "opportunity_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"opportunity_sources": {
                  Row: {
                    "created_at": string,"credits_per_check": number,"frequency_hours": number,"id": string,"ingestion_method": string,"last_reviewed_at": string | null,"name": string,"official_url": string,"status": string,"terms_url": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"credits_per_check"?: number,"frequency_hours": number,"id": string,"ingestion_method": string,"last_reviewed_at"?: string | null,"name": string,"official_url": string,"status": string,"terms_url": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"credits_per_check"?: number,"frequency_hours"?: number,"id"?: string,"ingestion_method"?: string,"last_reviewed_at"?: string | null,"name"?: string,"official_url"?: string,"status"?: string,"terms_url"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"opportunity_versions": {
                  Row: {
                    "checked_at": string,"content_hash": string,"created_at": string,"opportunity_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at": string,"content_hash": string,"created_at"?: string,"opportunity_id": string,"snapshot": NonNullable<Json>,"version": number
                  }
                  Update: {
                    "checked_at"?: string,"content_hash"?: string,"created_at"?: string,"opportunity_id"?: string,"snapshot"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunity_versions_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_topics": {
                  Row: {
                    "profile_id": string,"topic_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "profile_id": string,"topic_id": string
                  }
                  Update: {
                    "profile_id"?: string,"topic_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_topics_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_topics_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "academic_stage": string | null,"bio": string,"country": string,"created_at": string,"full_name": string,"id": string,"institution": string,"orcid_id": string | null,"skills": (string)[],"updated_at": string,"username": string | null,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_stage"?: string | null,"bio"?: string,"country"?: string,"created_at"?: string,"full_name": string,"id": string,"institution"?: string,"orcid_id"?: string | null,"skills"?: (string)[],"updated_at"?: string,"username"?: string | null,"visibility"?: string
                  }
                  Update: {
                    "academic_stage"?: string | null,"bio"?: string,"country"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"institution"?: string,"orcid_id"?: string | null,"skills"?: (string)[],"updated_at"?: string,"username"?: string | null,"visibility"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_topics": {
                  Row: {
                    "project_id": string,"topic_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "project_id": string,"topic_id": string
                  }
                  Update: {
                    "project_id"?: string,"topic_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_topics_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "research_projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_topics_topic_id_fkey"
      columns: ["topic_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                },"raul_runs": {
                  Row: {
                    "created_count": number,"credits_estimated": number,"credits_measured": number | null,"discarded_count": number,"duration_ms": number | null,"error_codes": (string)[],"error_count": number,"finished_at": string | null,"id": string,"lease_until": string,"max_sources": number,"mode": string,"request_key": string,"sources_reviewed": number,"started_at": string,"status": string,"unchanged_count": number,"updated_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_count"?: number,"credits_estimated"?: number,"credits_measured"?: number | null,"discarded_count"?: number,"duration_ms"?: number | null,"error_codes"?: (string)[],"error_count"?: number,"finished_at"?: string | null,"id"?: string,"lease_until"?: string,"max_sources": number,"mode": string,"request_key": string,"sources_reviewed"?: number,"started_at"?: string,"status"?: string,"unchanged_count"?: number,"updated_count"?: number
                  }
                  Update: {
                    "created_count"?: number,"credits_estimated"?: number,"credits_measured"?: number | null,"discarded_count"?: number,"duration_ms"?: number | null,"error_codes"?: (string)[],"error_count"?: number,"finished_at"?: string | null,"id"?: string,"lease_until"?: string,"max_sources"?: number,"mode"?: string,"request_key"?: string,"sources_reviewed"?: number,"started_at"?: string,"status"?: string,"unchanged_count"?: number,"updated_count"?: number
                  }
                  Relationships: [
                    
                  ]
                },"raul_source_runs": {
                  Row: {
                    "created_count": number,"credits_estimated": number,"credits_measured": number | null,"discarded_count": number,"duration_ms": number,"error_code": string | null,"recorded_at": string,"run_id": string,"source_id": string,"status": string,"unchanged_count": number,"updated_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_count"?: number,"credits_estimated"?: number,"credits_measured"?: number | null,"discarded_count"?: number,"duration_ms": number,"error_code"?: string | null,"recorded_at"?: string,"run_id": string,"source_id": string,"status": string,"unchanged_count"?: number,"updated_count"?: number
                  }
                  Update: {
                    "created_count"?: number,"credits_estimated"?: number,"credits_measured"?: number | null,"discarded_count"?: number,"duration_ms"?: number,"error_code"?: string | null,"recorded_at"?: string,"run_id"?: string,"source_id"?: string,"status"?: string,"unchanged_count"?: number,"updated_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "raul_source_runs_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "raul_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "raul_source_runs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "opportunity_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"recommendation_events": {
                  Row: {
                    "actor_id": string,"algorithm_version": string,"context": NonNullable<Json>,"created_at": string,"evaluation": NonNullable<Json>,"id": string,"impression_key": string,"need_id": string,"shown_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"algorithm_version": string,"context": NonNullable<Json>,"created_at"?: string,"evaluation": NonNullable<Json>,"id"?: string,"impression_key": string,"need_id": string,"shown_at"?: string | null
                  }
                  Update: {
                    "actor_id"?: string,"algorithm_version"?: string,"context"?: NonNullable<Json>,"created_at"?: string,"evaluation"?: NonNullable<Json>,"id"?: string,"impression_key"?: string,"need_id"?: string,"shown_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recommendation_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recommendation_events_need_id_fkey"
      columns: ["need_id"]
isOneToOne: false
      referencedRelation: "recruitment_needs"
      referencedColumns: ["id"]
    }
                  ]
                },"recommendation_feedback": {
                  Row: {
                    "actor_id": string,"comment": string,"created_at": string,"event_id": string,"response": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"comment"?: string,"created_at"?: string,"event_id": string,"response": string,"updated_at"?: string
                  }
                  Update: {
                    "actor_id"?: string,"comment"?: string,"created_at"?: string,"event_id"?: string,"response"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recommendation_feedback_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recommendation_feedback_event_id_actor_id_fkey"
      columns: ["event_id","actor_id"]
isOneToOne: false
      referencedRelation: "recommendation_events"
      referencedColumns: ["id","actor_id"]
    }
                  ]
                },"recruitment_needs": {
                  Row: {
                    "created_at": string,"description": string,"group_id": string,"id": string,"project_id": string | null,"required_skills": (string)[],"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"group_id": string,"id"?: string,"project_id"?: string | null,"required_skills"?: (string)[],"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"group_id"?: string,"id"?: string,"project_id"?: string | null,"required_skills"?: (string)[],"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recruitment_needs_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "research_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recruitment_needs_project_id_group_id_fkey"
      columns: ["project_id","group_id"]
isOneToOne: false
      referencedRelation: "research_projects"
      referencedColumns: ["id","group_id"]
    }
                  ]
                },"research_groups": {
                  Row: {
                    "accepting_members": boolean,"country": string,"created_at": string,"description": string,"id": string,"institution": string,"name": string,"owner_id": string,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepting_members"?: boolean,"country"?: string,"created_at"?: string,"description"?: string,"id"?: string,"institution"?: string,"name": string,"owner_id": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "accepting_members"?: boolean,"country"?: string,"created_at"?: string,"description"?: string,"id"?: string,"institution"?: string,"name"?: string,"owner_id"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "research_groups_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"research_projects": {
                  Row: {
                    "created_at": string,"description": string,"funding_currency": string | null,"funding_needed_amount": number | null,"group_id": string,"id": string,"status": string,"title": string,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"funding_currency"?: string | null,"funding_needed_amount"?: number | null,"group_id": string,"id"?: string,"status"?: string,"title": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"funding_currency"?: string | null,"funding_needed_amount"?: number | null,"group_id"?: string,"id"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "research_projects_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "research_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"scholarship_details": {
                  Row: {
                    "academic_stages": (string)[],"amount": NonNullable<Json>,"degree_areas": (string)[],"missing_information": (string)[],"opportunity_id": string,"requirements": NonNullable<Json>,"residence_requirement": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_stages"?: (string)[],"amount"?: NonNullable<Json>,"degree_areas"?: (string)[],"missing_information"?: (string)[],"opportunity_id": string,"requirements"?: NonNullable<Json>,"residence_requirement"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "academic_stages"?: (string)[],"amount"?: NonNullable<Json>,"degree_areas"?: (string)[],"missing_information"?: (string)[],"opportunity_id"?: string,"requirements"?: NonNullable<Json>,"residence_requirement"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "scholarship_details_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: true
      referencedRelation: "opportunities"
      referencedColumns: ["id"]
    }
                  ]
                },"topics": {
                  Row: {
                    "id": string,"name": string,"parent_id": string | null,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"name": string,"parent_id"?: string | null,"slug": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"parent_id"?: string | null,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "topics_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "cancel_join_request":
{ Args: { "p_request_id": string }; Returns: {
              "applicant_id": string,
"created_at": string,
"decided_at": string | null,
"decided_by": string | null,
"group_id": string,
"id": string,
"message": string | null,
"status": string
            }
                          SetofOptions: {
        from: "*"
        to: "group_join_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"decide_join_request":
{ Args: { "p_decision": string,"p_request_id": string }; Returns: {
              "applicant_id": string,
"created_at": string,
"decided_at": string | null,
"decided_by": string | null,
"group_id": string,
"id": string,
"message": string | null,
"status": string
            }
                          SetofOptions: {
        from: "*"
        to: "group_join_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"diagnose_recruitment_need":
{ Args: { "p_impression_key": string,"p_need_id": string }; Returns: {
              "actor_id": string,
"algorithm_version": string,
"context": NonNullable<Json>,
"created_at": string,
"evaluation": NonNullable<Json>,
"id": string,
"impression_key": string,
"need_id": string,
"shown_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "recommendation_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"discover_groups":
{ Args: { "p_accepting"?: boolean,"p_limit"?: number,"p_offset"?: number,"p_search"?: string,"p_topic_id"?: string }; Returns: {
              "accepting_members": boolean,"country": string,"created_at": string,"description": string,"id": string,"institution": string,"match_count": number,"matched_topics": (string)[],"name": string,"owner_id": string,"updated_at": string,"visibility": string
            }[]
                           },
"judy_begin_run":
{ Args: { "p_parameters": Json,"p_request_id": string,"p_trigger": string }; Returns: Json
                           },
"judy_finish_run":
{ Args: { "p_lease_token": string,"p_report": Json,"p_run_id": string }; Returns: Json
                           },
"judy_get_run":
{ Args: { "p_request_id": string }; Returns: Json
                           },
"judy_renew_run":
{ Args: { "p_lease_token": string,"p_run_id": string }; Returns: Json
                           },
"judy_upsert_opportunities":
{ Args: { "p_batch_key": string,"p_items": Json,"p_lease_token": string,"p_run_id": string }; Returns: Json
                           },
"mark_recommendation_shown":
{ Args: { "p_event_id": string }; Returns: undefined
                           },
"raul_begin_run":
{ Args: { "p_max_sources": number,"p_mode": string,"p_request_key": string }; Returns: Json
                           },
"raul_expire_run":
{ Args: { "p_run_id": string }; Returns: Json
                           },
"raul_fail_run":
{ Args: { "p_error_code": string,"p_run_id": string }; Returns: Json
                           },
"raul_finish_run":
{ Args: { "p_run_id": string,"p_status": string }; Returns: Json
                           },
"raul_record_source_result":
{ Args: { "p_created": number,"p_credits_estimated": number,"p_credits_measured": number,"p_discarded": number,"p_duration_ms": number,"p_error_code": string,"p_run_id": string,"p_source_id": string,"p_status": string,"p_unchanged": number,"p_updated": number }; Returns: undefined
                           },
"raul_upsert_opportunity":
{ Args: { "p_credits_estimated": number,"p_credits_measured": number,"p_data": Json,"p_duration_ms": number,"p_external_id": string,"p_run_id": string,"p_source_id": string }; Returns: Json
                           },
"request_to_join":
{ Args: { "p_group_id": string,"p_message"?: string }; Returns: {
              "applicant_id": string,
"created_at": string,
"decided_at": string | null,
"decided_by": string | null,
"group_id": string,
"id": string,
"message": string | null,
"status": string
            }
                          SetofOptions: {
        from: "*"
        to: "group_join_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_group_topics":
{ Args: { "p_group_id": string,"p_topic_ids": (string)[] }; Returns: undefined
                           },
"save_profile_topics":
{ Args: { "p_topic_ids": (string)[] }; Returns: undefined
                           },
"save_project_topics":
{ Args: { "p_project_id": string,"p_topic_ids": (string)[] }; Returns: undefined
                           },
"save_recommendation_feedback":
{ Args: { "p_comment": string,"p_event_id": string,"p_response": string }; Returns: undefined
                           },
"save_recruitment_need":
{ Args: { "p_description": string,"p_group_id": string,"p_need_id": string,"p_project_id": string,"p_required_skills": (string)[],"p_status": string,"p_title": string }; Returns: string
                           },
"save_research_group":
{ Args: { "p_accepting_members": boolean,"p_country": string,"p_description": string,"p_group_id": string,"p_institution": string,"p_name": string,"p_topic_ids": (string)[],"p_visibility": string }; Returns: string
                           },
"save_research_project":
{ Args: { "p_description": string,"p_funding_currency": string,"p_funding_needed_amount": number,"p_group_id": string,"p_project_id": string,"p_status": string,"p_title": string,"p_topic_ids": (string)[],"p_visibility": string }; Returns: string
                           },
"upsert_profile":
{ Args: { "p_academic_stage": string,"p_bio": string,"p_country": string,"p_full_name": string,"p_institution": string,"p_orcid_id": string,"p_skills": (string)[],"p_topic_ids": (string)[],"p_username": string,"p_visibility": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
