import { z } from "zod";
import { parseOrcidId } from "../../features/profiles/import/orcid-id";

const optionalText = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres.`);
export const loginSchema = z.object({
  email: z.email("Introduce un correo válido."),
  password: z.string().min(1, "Introduce tu contraseña."),
});
export const passwordSchema = z
  .string()
  .min(10, "Usa al menos 10 caracteres.")
  .max(128, "Máximo 128 caracteres.");
export const registrationSchema = loginSchema.extend({
  password: passwordSchema,
});
export const emailSchema = z.email("Introduce un correo válido.");
export const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Indica tu nombre completo.").max(150),
  username: optionalText(40).refine(
    (v) => !v || /^[a-z0-9_]{3,40}$/.test(v),
    "Usa entre 3 y 40 letras minúsculas, números o guiones bajos.",
  ),
  institution: optionalText(200),
  country: optionalText(100),
  academic_stage: z.enum([
    "",
    "student",
    "phd",
    "postdoc",
    "researcher",
    "other",
  ]),
  bio: optionalText(3000),
  skills: optionalText(2000).refine(
    (value) => value.split(",").filter((skill) => skill.trim()).length <= 50,
    "Indica un máximo de 50 competencias.",
  ),
  orcid_id: optionalText(19).refine(
    (v) => {
      if (!v) return true;
      try {
        return parseOrcidId(v) === v;
      } catch {
        return false;
      }
    },
    "Introduce un ORCID iD válido con dígito de control correcto.",
  ),
  visibility: z.enum(["public", "private"]),
});
export const groupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres.")
    .max(160),
  description: z
    .string()
    .trim()
    .min(20, "Describe el grupo con al menos 20 caracteres.")
    .max(6000),
  institution: optionalText(200),
  country: optionalText(100),
  visibility: z.enum(["public", "private"]),
  accepting_members: z.boolean(),
});
export const projectSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Indica un título de al menos 3 caracteres.")
      .max(200),
    description: z
      .string()
      .trim()
      .min(20, "Describe el proyecto con al menos 20 caracteres.")
      .max(10000),
    status: z.enum(["draft", "active", "completed"]),
    visibility: z.enum(["public", "private"]),
    funding_needed_amount: z
      .string()
      .trim()
      .refine(
        (v) =>
          !v ||
          (/^\d+(\.\d{1,2})?$/.test(v) &&
            Number.isFinite(Number(v)) &&
            Number(v) >= 0 &&
            Number(v) <= 9999999999999.99),
        "Indica un importe positivo o cero, con hasta dos decimales y un máximo de 9999999999999,99.",
      ),
    funding_currency: z
      .string()
      .trim()
      .refine(
        (v) => !v || /^[A-Z]{3}$/.test(v),
        "Usa un código de moneda de tres letras, como EUR.",
      ),
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.funding_needed_amount) !== Boolean(data.funding_currency))
      ctx.addIssue({
        code: "custom",
        path: ["funding_currency"],
        message: "El importe y la moneda deben indicarse juntos.",
      });
  });
export const joinRequestSchema = z
  .string()
  .trim()
  .max(2000, "Máximo 2000 caracteres.");
export function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(" ");
}
