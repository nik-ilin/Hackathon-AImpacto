import { createHash } from "node:crypto";
import type { CallStatus } from "../types.ts";

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Quita etiquetas HTML y normaliza espacios. Suficiente para resúmenes; no es un sanitizador. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|li|h[1-6]|div|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Convierte fechas habituales en las fuentes a ISO (UTC):
 * "2026-11-03", "2026-12-01T00:00:00.000+0000", "15/11/2026", "11 de noviembre de 2026".
 * Una fecha sin hora se interpreta como fin del día en Madrid (23:59:59), que es como se leen los plazos.
 */
export function parseDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input.trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return endOfMadridDay(+match[1], +match[2], +match[3]);
  match = text.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2}):?(\d{2})$/);
  if (match) {
    const parsed = new Date(`${match[1]}${match[2]}:${match[3]}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return endOfMadridDay(+match[3], +match[2], +match[1]);
  const spanish = findSpanishDate(text);
  if (spanish) return spanish;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

/** Primera fecha escrita en castellano dentro de un texto ("hasta el 15 de octubre de 2026 a las 15:00h"). */
export function findSpanishDate(text: string): string | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = normalized.match(/(\d{1,2})\s+de\s+([a-z]+)\s+(?:de|del)\s+(\d{4})/);
  if (!match || !MONTHS[match[2]]) return null;
  return endOfMadridDay(+match[3], MONTHS[match[2]], +match[1]);
}

function endOfMadridDay(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (new Date(Date.UTC(year, month - 1, day)).getUTCMonth() !== month - 1) return null; // 31/02, etc.
  // Madrid es UTC+1 en invierno y UTC+2 en verano (último domingo de marzo a último de octubre).
  const offset = isMadridSummerTime(year, month, day) ? 2 : 1;
  return new Date(Date.UTC(year, month - 1, day, 23 - offset, 59, 59)).toISOString();
}

function lastSunday(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - last.getUTCDay();
}
function isMadridSummerTime(year: number, month: number, day: number): boolean {
  if (month < 3 || month > 10) return false;
  if (month > 3 && month < 10) return true;
  return month === 3 ? day >= lastSunday(year, 3) : day < lastSunday(year, 10);
}

export function computeStatus(opensAt: string | null, deadlineAt: string | null, now: Date): CallStatus {
  const t = now.getTime();
  if (deadlineAt && new Date(deadlineAt).getTime() < t) return "closed";
  if (opensAt && new Date(opensAt).getTime() > t) return "forthcoming";
  if (deadlineAt) return "open";
  return "unknown";
}

/** Hash estable del contenido relevante: detecta cambios entre ejecuciones. */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function asHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : /^www\./i.test(trimmed) ? `https://${trimmed}` : null;
  if (!withScheme) return null;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
