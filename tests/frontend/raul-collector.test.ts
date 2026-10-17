import { describe, expect, it } from "vitest";
import {
  canonicalOfficialUrl,
  extractOfficialPage,
  sourceSpecs,
  stableExternalId,
  validateDeadline,
} from "../../supabase/functions/raul-trigger/catalog";
import { tokensEqual } from "../../supabase/functions/raul-trigger/security";

// Short test fixtures modeled on the official pages checked 2026-10-17.
// They are fixtures, not a claim that a live scheduled collection ran.
const markdown: Record<string, string> = {
  imdea_energy_2027: `IMDEA Energy launches 30 internships for Bachelor's and Master's students in 2027.
  Applications close 7 November 2026. Applicants need a residence permit in Spain during the internship.
  Grants up to 2,200 euros for Bachelor students and 2,500 euros for Master students. Energy research internships.`,
  upm_metrologia_2026: `Beca de metrología y análisis de datos en las áreas de volumen y temperatura.
  Estudiantes de Grado en Ingeniería. Plazo: 26 de octubre de 2026, 14:00 horas.
  Dotación de 300 euros brutos mensuales. Investigación y medidas de laboratorio.`,
  rtve_tfm_2026: `IX Impulsa Visión RTVE: ayudas a la investigación para TFM del curso 2026/27.
  Para estudiantes de Máster oficial de universidades españolas. Fecha límite 16 de diciembre de 2026.
  8.000 euros para el estudiante y 4.000 euros para el centro. Nuevas audiencias y contenidos informativos digitales.`,
};

describe("Raúl: extracción verificable", () => {
  it("normaliza URL oficial y usa URL como ID estable cuando falta ID externo", () => {
    expect(canonicalOfficialUrl("https://EXAMPLE.org/call/?utm_source=x#part")).toBe("https://example.org/call");
    expect(stableExternalId({ externalId: null, url: "https://EXAMPLE.org/call/?utm_source=x" }))
      .toBe("url:https://example.org/call");
    expect(() => canonicalOfficialUrl("http://example.org/call")).toThrow("official_url_https_required");
  });

  it("verifica las tres fichas con evidencia y plazos vigentes", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    for (const source of sourceSpecs) {
      const item = extractOfficialPage(source, markdown[source.id], now);
      expect(item.status).toBe("open");
      expect(item.official_url).toMatch(/^https:\/\//);
      expect(item.checked_at).toBe(now.toISOString());
      expect(item.official_deadline_date >= "2026-10-17").toBe(true);
    }
  });

  it("no inventa requisitos sin evidencia", () => {
    const source = sourceSpecs[1];
    const item = extractOfficialPage(source, markdown[source.id], new Date("2026-10-17T12:00:00Z"));
    expect(item.scholarship_details.residence_requirement).toEqual({ state: "unknown", value: null });
    expect(item.scholarship_details.requirements.find((r) => r.key === "residence")?.state).toBe("unknown");
    expect(item.scholarship_details.missing_information).toContain("URL de solicitud");
    expect(item.scholarship_details.missing_information).toContain("bases completas");
  });

  it("reconoce un cambio de plazo y falla ante extracción incompleta", () => {
    const source = sourceSpecs[1];
    const updated = extractOfficialPage(source, markdown[source.id].replace("26 de octubre de 2026", "27 de octubre de 2026"), new Date("2026-10-17"));
    expect(updated.official_deadline_date).toBe("2026-10-27");
    const ranged = extractOfficialPage(source, markdown[source.id].replace(
      "Plazo: 26 de octubre de 2026",
      "Plazo de solicitud: del 1 de octubre de 2026 al 26 de octubre de 2026",
    ), new Date("2026-10-17"));
    expect(ranged.official_deadline_date).toBe("2026-10-26");
    expect(() => extractOfficialPage(source, "beca", new Date("2026-10-17"))).toThrow("official_evidence_missing");
    expect(validateDeadline("2026-10-26T14:00:00+02:00", new Date("2026-10-26T12:01:00Z"))).toBe("closed");
    expect(() => validateDeadline("2026-02-31", new Date("2026-10-17"))).toThrow("invalid_deadline");
  });

  it("rechaza la falta de secreto y uno incorrecto", async () => {
    expect(await tokensEqual(null, "configured-secret")).toBe(false);
    expect(await tokensEqual("wrong", "configured-secret")).toBe(false);
    expect(await tokensEqual("configured-secret", "configured-secret")).toBe(true);
  });
});
