import type { Profile } from "../../types/database";

export type SourceRequirement = {
  key: string;
  label: string;
  state: "confirmed" | "unknown";
  value: unknown;
  source_url?: string;
};

export type Assessment = {
  label: string;
  sourceState: "confirmed" | "unknown";
  profileState: "confirmed" | "incompatible" | "unknown";
  sourceUrl?: string;
};

const stages = new Set(["student", "phd", "postdoc", "researcher", "other"]);

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
    return value;
  return [];
}

export function parseRequirements(value: unknown): SourceRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SourceRequirement[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.key !== "string" ||
      typeof record.label !== "string" ||
      !["confirmed", "unknown"].includes(String(record.state))
    ) return [];
    return [{
      key: record.key,
      label: record.label,
      state: record.state as SourceRequirement["state"],
      value: record.value,
      source_url: typeof record.source_url === "string" &&
        record.source_url.startsWith("https://") ? record.source_url : undefined,
    }];
  });
}

export function assessRequirement(
  requirement: SourceRequirement,
  profile: Pick<Profile, "academic_stage" | "skills"> | null,
): Assessment {
  let profileState: Assessment["profileState"] = "unknown";
  const accepted = stringValues(requirement.value).map((entry) => entry.trim().toLowerCase());
  if (requirement.state === "confirmed" && profile) {
    if (requirement.key === "skill" && accepted.length) {
      const declared = new Set(profile.skills.map((skill) => skill.trim().toLowerCase()));
      if (accepted.every((skill) => declared.has(skill))) profileState = "confirmed";
      // A capability absent from a profile has not been disproved.
    } else if (requirement.key === "academic_stage" && profile.academic_stage && accepted.length) {
      // 'student' does not identify Grado, Máster or a specific degree.
      if (accepted.includes(profile.academic_stage)) profileState = "confirmed";
      else if (accepted.every((entry) => stages.has(entry))) profileState = "incompatible";
    }
  }
  return {
    label: requirement.label,
    sourceState: requirement.state,
    profileState,
    sourceUrl: requirement.source_url,
  };
}
