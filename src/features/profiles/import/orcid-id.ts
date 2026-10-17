const ORCID_ID = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

/** Accepts a bare iD or its canonical HTTPS URL. An iD entered here is not identity verification. */
export function parseOrcidId(input: string): string {
  const value = input.trim();
  const candidate = value.startsWith("https://orcid.org/")
    ? value.slice("https://orcid.org/".length)
    : value;
  const id = candidate.toUpperCase();
  if (!ORCID_ID.test(id)) {
    throw new Error("Introduce un ORCID iD válido o una URL https://orcid.org/ válida.");
  }

  let total = 0;
  for (const character of id.replaceAll("-", "").slice(0, 15)) {
    total = (total + Number(character)) * 2;
  }
  const digit = (12 - (total % 11)) % 11;
  const check = digit === 10 ? "X" : String(digit);
  if (id.at(-1) !== check) {
    throw new Error("El dígito de control del ORCID iD no es válido.");
  }
  return id;
}
