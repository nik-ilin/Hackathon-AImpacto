// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { assessRequirement, parseRequirements } from "../../src/features/scholarships/assessment";
import { ScholarshipCard } from "../../src/features/scholarships/ScholarshipsPage";
import type { ScholarshipRecord } from "../../src/features/scholarships/service";
import type { Tables } from "../../src/types/database";

vi.mock("../../src/app/providers/auth-context", () => ({ useAuth: () => ({ session: { user: { id: "student" } } }) }));
afterEach(cleanup);

const profile = { academic_stage: "student", skills: ["Python"] } as Pick<Tables<"profiles">, "academic_stage" | "skills">;

describe("Comparación prudente de becas", () => {
  it("no convierte datos no publicados en confirmados ni ausencia de perfil en incompatibilidad", () => {
    const requirements = parseRequirements([
      { key: "skill", label: "Python", state: "confirmed", value: "Python", source_url: "https://official.example/conditions" },
      { key: "skill", label: "R", state: "confirmed", value: "R", source_url: "https://official.example/conditions" },
      { key: "residence", label: "Residencia exigida", state: "unknown", value: null },
      { key: "degree_area", label: "Titulación", state: "confirmed", value: "Física", source_url: "https://official.example/conditions" },
    ]);
    expect(requirements.map((requirement) => assessRequirement(requirement, profile).profileState)).toEqual([
      "confirmed", "unknown", "unknown", "unknown",
    ]);
    expect(assessRequirement(requirements[0], null).profileState).toBe("unknown");
  });
  it("marca incompatibilidad solo en etapa académica explícita", () => {
    const phd = { key: "academic_stage", label: "Doctorado", state: "confirmed", value: "phd" } as const;
    expect(assessRequirement(phd, { academic_stage: "postdoc", skills: [] }).profileState).toBe("incompatible");
    expect(assessRequirement(phd, { academic_stage: "phd", skills: [] }).profileState).toBe("confirmed");
    const degree = { ...phd, value: "master" };
    expect(assessRequirement(degree, profile).profileState).toBe("unknown");
  });
});

describe("Ficha de beca", () => {
  it("muestra fuente, plazo, comprobación, requisitos pendientes y etiqueta fixtures", () => {
    const item = {
      opportunity: {
        id: "imdea", source_id: "imdea", opportunity_type: "research_internship",
        title: "Prácticas IMDEA Energía 2027", provider: "IMDEA Energía",
        summary: "Investigación en energía.", official_url: "https://energia.imdea.org/en/call/",
        application_url: null, bases_url: null, official_deadline_date: "2026-11-07",
        official_deadline_at: null, internal_deadline_at: null, country: "España", opens_at: null,
        external_id: "internships-2027", status: "open", content_hash: "hash", content_version: 1,
        created_at: "2026-10-17T10:00:00Z", updated_at: "2026-10-17T10:00:00Z",
        checked_at: "2026-10-17T10:00:00Z", provenance: { seed_fixture: true },
      },
      details: {
        opportunity_id: "imdea", updated_at: "2026-10-17T10:00:00Z",
        academic_stages: ["bachelor", "master"], degree_areas: [], amount: { state: "unknown", value: null },
        residence_requirement: { state: "unknown", value: null },
        requirements: [{ key: "enrollment", label: "Matrícula oficial", state: "confirmed", value: "Grado o Máster", source_url: "https://energia.imdea.org/en/call/" }],
        missing_information: ["Hora exacta del cierre"],
      },
      source: { id: "imdea", name: "IMDEA Energía", official_url: "https://energia.imdea.org/en/call/", terms_url: "https://energia.imdea.org/en/legal/", ingestion_method: "firecrawl", frequency_hours: 24, credits_per_check: 1, last_reviewed_at: "2026-10-17T10:00:00Z", status: "active", created_at: "2026-10-17T10:00:00Z", updated_at: "2026-10-17T10:00:00Z" },
    } as ScholarshipRecord;
    render(<MemoryRouter><ScholarshipCard item={item} profile={null} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Fuente oficial/ }).getAttribute("href")).toBe("https://energia.imdea.org/en/call/");
    expect(screen.getByText(/7 de noviembre de 2026/)).toBeTruthy();
    expect(screen.getByText("Ficha de demostración")).toBeTruthy();
    expect(screen.getByText("Matrícula oficial")).toBeTruthy();
    expect(screen.getByText("Hora exacta del cierre")).toBeTruthy();
    expect(screen.getByText("Perfil sin datos suficientes")).toBeTruthy();
  });
});
