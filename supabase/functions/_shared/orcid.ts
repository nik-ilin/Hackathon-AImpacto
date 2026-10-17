import { parseOrcidId } from "./orcid-id.ts";

export { parseOrcidId };

export type ProfileImportData = {
  source: "ORCID";
  fields: Partial<
    Record<
      "full_name" | "institution" | "country" | "bio" | "orcid_id" | "skills",
      string
    >
  >;
  context: string[];
  topicHints: string[];
};

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
const at = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((current, key) => object(current)?.[key], value);
const string = (value: unknown): string | null => {
  const actual = typeof value === "string" ? value.trim() : null;
  return actual || null;
};
const content = (value: unknown): string | null =>
  string(value) ?? string(at(value, "content")) ?? string(at(value, "value"));
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const visible = (value: unknown): boolean => {
  const visibility = object(value)?.visibility;
  return (
    visibility === undefined ||
    visibility === "PUBLIC" ||
    visibility === "public"
  );
};

function summaries(
  root: unknown,
  section: "employments" | "educations" | "works",
  key: string,
): unknown[] {
  const groups = array(
    at(root, "activities-summary", section, "affiliation-group"),
  ).concat(array(at(root, "activities-summary", section, "group")));
  const fromGroups = groups.flatMap((group) => {
    const direct = array(at(group, key));
    if (direct.length) return direct;
    return array(at(group, "summaries")).flatMap((summary) => {
      const nested = at(summary, key);
      return nested === undefined ? [summary] : [nested];
    });
  });
  return fromGroups.length
    ? fromGroups
    : array(at(root, "activities-summary", section, key));
}

/** Normalizes only values actually present in the public v3 record. */
export function normalizeOrcidRecord(
  input: unknown,
  orcidId: string,
): ProfileImportData {
  const id = parseOrcidId(orcidId);
  if (!object(input))
    throw new Error("La respuesta de ORCID no tiene formato de registro.");
  const returnedId = string(at(input, "orcid-identifier", "path"));
  if (returnedId && parseOrcidId(returnedId) !== id) {
    throw new Error("ORCID devolvió un registro de otra persona.");
  }
  const fields: ProfileImportData["fields"] = { orcid_id: id };
  const context: string[] = [];
  const topicHints: string[] = [];

  const name = at(input, "person", "name");
  if (visible(name)) {
    const credit = content(at(name, "credit-name"));
    const given = content(at(name, "given-names"));
    const family = content(at(name, "family-name"));
    const fullName = credit ?? [given, family].filter(Boolean).join(" ");
    if (fullName) fields.full_name = fullName;
  }
  const biography = at(input, "person", "biography");
  if (visible(biography)) {
    const bio = content(biography);
    if (bio) fields.bio = bio;
  }

  const countries = array(at(input, "person", "addresses", "address"))
    .filter(visible)
    .map((address) => content(at(address, "country")))
    .filter((value): value is string => Boolean(value));
  const uniqueCountries = [...new Set(countries)];
  if (uniqueCountries.length === 1) fields.country = uniqueCountries[0];
  else if (uniqueCountries.length > 1)
    context.push(`Países en ORCID: ${uniqueCountries.join(", ")}`);

  const jobs = summaries(input, "employments", "employment-summary").filter(
    visible,
  );
  const currentInstitutions = jobs
    .filter((job) => object(job)?.["end-date"] === null)
    .map((job) => content(at(job, "organization", "name")))
    .filter((value): value is string => Boolean(value));
  const uniqueInstitutions = [...new Set(currentInstitutions)];
  if (uniqueInstitutions.length === 1)
    fields.institution = uniqueInstitutions[0];
  for (const job of jobs.slice(0, 10)) {
    const organization = content(at(job, "organization", "name"));
    const role = content(at(job, "role-title"));
    if (organization)
      context.push(
        `Empleo: ${[role, organization].filter(Boolean).join(" · ")}`,
      );
  }

  const education = summaries(input, "educations", "education-summary").filter(
    visible,
  );
  for (const item of education.slice(0, 10)) {
    const organization = content(at(item, "organization", "name"));
    const degree = content(at(item, "role-title"));
    if (organization)
      context.push(
        `Formación: ${[degree, organization].filter(Boolean).join(" · ")}`,
      );
  }

  for (const keyword of array(
    at(input, "person", "keywords", "keyword"),
  ).filter(visible)) {
    const hint = content(keyword);
    if (hint && !topicHints.includes(hint)) topicHints.push(hint);
  }
  const works = summaries(input, "works", "work-summary").filter(visible);
  for (const item of works.slice(0, 10)) {
    const title = content(at(item, "title", "title"));
    if (title) context.push(`Publicación: ${title}`);
  }
  if (works.length > 10)
    context.push(`Se muestran 10 de ${works.length} publicaciones públicas.`);
  return { source: "ORCID", fields, context, topicHints };
}
