import { describe, expect, it } from "vitest";
import { parseBackendConfig } from "../../src/lib/supabase/config";
import {
  groupSchema,
  profileSchema,
  projectSchema,
  registrationSchema,
} from "../../src/lib/validation/schemas";

const profile = {
  full_name: "Investigadora García",
  username: "",
  institution: "",
  country: "",
  academic_stage: "student",
  bio: "",
  skills: "",
  orcid_id: "",
  visibility: "private",
};
const project = {
  title: "Biología de sistemas",
  description: "Investigación de redes biológicas y sus interacciones.",
  status: "draft",
  visibility: "private",
  funding_needed_amount: "",
  funding_currency: "",
};
describe("Configuración pública del navegador", () => {
  it("mantiene desconectada la aplicación cuando falta configuración", () => {
    expect(parseBackendConfig(undefined, undefined).config).toBeNull();
  });
  it("acepta URL local y clave publicable", () => {
    expect(
      parseBackendConfig("http://127.0.0.1:54321", "sb_publishable_test").config
        ?.url,
    ).toBe("http://127.0.0.1:54321");
  });
  it.each([
    "sb_secret_test",
    "not-a-key",
    `e30.${btoa(JSON.stringify({ role: "service_role" }))}.test`,
  ])("rechaza clave privilegiada o mal formada %s", (key) => {
    expect(
      parseBackendConfig("https://example.supabase.co", key).config,
    ).toBeNull();
  });
  it("acepta una clave anon heredada", () => {
    const key = `e30.${btoa(JSON.stringify({ role: "anon" }))}.test`;
    expect(
      parseBackendConfig("https://example.supabase.co", key).config,
    ).not.toBeNull();
  });
  it("rechaza protocolos que no son HTTP", () => {
    expect(
      parseBackendConfig("javascript:alert(1)", "sb_publishable_test").config,
    ).toBeNull();
  });
});
describe("Validaciones del dominio", () => {
  it("exige una contraseña de registro suficientemente larga", () => {
    expect(
      registrationSchema.safeParse({
        email: "a@example.com",
        password: "short",
      }).success,
    ).toBe(false);
  });
  it("rechaza un correo incorrecto", () => {
    expect(
      registrationSchema.safeParse({
        email: "correo",
        password: "contraseña-segura",
      }).success,
    ).toBe(false);
  });
  it("permite que un estudiante cree un perfil universal privado", () => {
    expect(profileSchema.parse(profile).academic_stage).toBe("student");
  });
  it("respeta el límite SQL de 150 caracteres del nombre", () => {
    expect(
      profileSchema.safeParse({ ...profile, full_name: "a".repeat(151) })
        .success,
    ).toBe(false);
  });
  it("rechaza nombres de usuario ambiguos", () => {
    expect(
      profileSchema.safeParse({ ...profile, username: "nombre con espacios" })
        .success,
    ).toBe(false);
  });
  it("valida la forma del ORCID opcional", () => {
    expect(
      profileSchema.safeParse({ ...profile, orcid_id: "0000-0002-1825-0097" })
        .success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ ...profile, orcid_id: "invalid" }).success,
    ).toBe(false);
  });
  it("crea grupos sin depender de la etapa académica", () => {
    expect(
      groupSchema.safeParse({
        name: "Mi primer grupo",
        description: "Estudio colaborativo sobre física aplicada.",
        institution: "",
        country: "",
        visibility: "public",
        accepting_members: true,
      }).success,
    ).toBe(true);
  });
  it("acepta un proyecto sin necesidad de financiación", () => {
    expect(projectSchema.safeParse(project).success).toBe(true);
  });
  it.each([
    ["-1", "EUR"],
    ["Infinity", "EUR"],
    ["99999999999999", "EUR"],
    ["12.001", "EUR"],
    ["12", ""],
    ["", "EUR"],
    ["12", "euros"],
  ])("rechaza financiación incoherente %s %s", (amount, currency) => {
    expect(
      projectSchema.safeParse({
        ...project,
        funding_needed_amount: amount,
        funding_currency: currency,
      }).success,
    ).toBe(false);
  });
  it("acepta un importe cero con moneda", () => {
    expect(
      projectSchema.safeParse({
        ...project,
        funding_needed_amount: "0",
        funding_currency: "EUR",
      }).success,
    ).toBe(true);
  });
});
