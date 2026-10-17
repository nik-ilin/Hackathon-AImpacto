import { useEffect, useRef, useState } from "react";
import type { Tables } from "../../../types/database";
import type { MutationIdentity } from "../../../lib/supabase/identity";
import { errorMessage } from "../../../lib/errors/messages";
import { fetchOrcidImport } from "./orcid-client";
import { parseLinkedInExport } from "./linkedin";

type ImportField = "full_name" | "institution" | "country" | "bio" | "skills" | "orcid_id";
type ImportData = {
  source: "ORCID" | "LinkedIn";
  fields: Partial<Record<ImportField, string>>;
  context: string[];
  topicHints: string[];
};

const fieldLabels: Record<ImportField, string> = {
  full_name: "Nombre completo",
  institution: "Institución",
  country: "País",
  bio: "Sobre tu investigación",
  skills: "Competencias",
  orcid_id: "ORCID",
};

function matchingTopics(hints: string[], topics: Tables<"topics">[]) {
  const normalized = new Set(hints.map((hint) => hint.trim().toLocaleLowerCase()));
  return topics.filter((topic) => normalized.has(topic.name.toLocaleLowerCase()));
}

export function ProfileImport({
  identity,
  topics,
  onApply,
}: {
  identity: MutationIdentity;
  topics: Tables<"topics">[];
  onApply: (fields: Partial<Record<ImportField, string>>, topicIds: string[]) => void;
}) {
  const [orcidInput, setOrcidInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportData | null>(null);
  const [edited, setEdited] = useState<Partial<Record<ImportField, string>>>({});
  const [chosen, setChosen] = useState<ImportField[]>([]);
  const [chosenTopics, setChosenTopics] = useState<string[]>([]);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => {
    generation.current += 1;
    controller.current?.abort();
  }, []);

  async function load(run: (signal: AbortSignal) => Promise<ImportData>) {
    controller.current?.abort();
    const request = ++generation.current;
    const nextController = new AbortController();
    controller.current = nextController;
    setBusy(true);
    setError(null);
    setPreview(null);
    setChosen([]);
    setChosenTopics([]);
    try {
      const data = await run(nextController.signal);
      if (request !== generation.current || !identity.isCurrent()) return;
      setPreview(data);
      setEdited(data.fields);
    } catch (failure) {
      if (request === generation.current && identity.isCurrent() && !nextController.signal.aborted)
        setError(errorMessage(failure));
    } finally {
      if (request === generation.current && identity.isCurrent()) setBusy(false);
    }
  }

  function apply() {
    if (!preview || !identity.isCurrent()) return;
    const fields: Partial<Record<ImportField, string>> = {};
    for (const key of chosen) fields[key] = edited[key] ?? "";
    onApply(fields, chosenTopics);
    setPreview(null);
    setChosen([]);
    setChosenTopics([]);
    setError(null);
  }

  const topicMatches = preview ? matchingTopics(preview.topicHints, topics) : [];
  return (
    <section className="panel form-stack" aria-label="Importar perfil">
      <h2>Importar perfil</h2>
      <p>Revisa y edita los datos antes de aplicarlos. Nada se guarda hasta que pulses «Guardar perfil» o «Guardar y comenzar».</p>
      <div className="form-grid">
        <label className="field">
          <span>ORCID iD o URL</span>
          <input value={orcidInput} onChange={(event) => setOrcidInput(event.target.value)} placeholder="https://orcid.org/0000-0000-0000-000X" />
        </label>
        <button type="button" disabled={busy} onClick={() => void load((signal) => fetchOrcidImport(orcidInput, signal))}>
          Consultar ORCID
        </button>
      </div>
      <p>Introducir un ORCID manualmente o importar sus datos públicos no verifica que el registro sea tuyo.</p>
      <label className="field">
        <span>Archivo exportado de LinkedIn (.zip o .csv)</span>
        <input type="file" accept=".zip,.csv" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void load(() => parseLinkedInExport(file));
        }} />
      </label>
      <p>Descárgalo en LinkedIn: Configuración y privacidad &gt; Privacidad de datos &gt; Descargar tus datos. El archivo se analiza aquí y no se sube ni se conserva.</p>
      {busy && <p role="status">Leyendo datos de perfil…</p>}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div className="form-stack" aria-label={`Vista previa ${preview.source}`}>
          <h3>Vista previa de {preview.source}</h3>
          <p>Marca solo los campos que quieres aplicar. Los valores actuales se conservan por defecto.</p>
          {Object.entries(preview.fields).map(([rawKey, value]) => {
            const key = rawKey as ImportField;
            return (
              <div key={key} className="form-grid">
                <label>
                  <input type="checkbox" checked={chosen.includes(key)} onChange={(event) => setChosen((old) => event.target.checked ? [...old, key] : old.filter((item) => item !== key))} />
                  {fieldLabels[key]} ({preview.source})
                </label>
                <label className="field">
                  <span>Valor propuesto: {fieldLabels[key]}</span>
                  {key === "bio" ? (
                    <textarea rows={3} maxLength={3000} value={edited[key] ?? value ?? ""} onChange={(event) => setEdited((old) => ({ ...old, [key]: event.target.value }))} />
                  ) : (
                    <input maxLength={key === "full_name" ? 150 : key === "institution" ? 200 : key === "country" ? 100 : key === "orcid_id" ? 19 : 2000} value={edited[key] ?? value ?? ""} onChange={(event) => setEdited((old) => ({ ...old, [key]: event.target.value }))} />
                  )}
                </label>
              </div>
            );
          })}
          {topicMatches.length > 0 && (
            <fieldset>
              <legend>Coincidencias exactas con disciplinas existentes</legend>
              {topicMatches.map((topic) => (
                <label key={topic.id}>
                  <input type="checkbox" checked={chosenTopics.includes(topic.id)} onChange={(event) => setChosenTopics((old) => event.target.checked ? [...old, topic.id] : old.filter((id) => id !== topic.id))} />
                  {topic.name}
                </label>
              ))}
            </fieldset>
          )}
          {preview.context.length > 0 && (
            <details>
              <summary>Otros datos encontrados (solo para consultar)</summary>
              <ul>{preview.context.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
              <p>El perfil actual no tiene campos para experiencia, formación o publicaciones. Estos datos no se guardarán.</p>
            </details>
          )}
          <button type="button" disabled={chosen.length === 0 && chosenTopics.length === 0} onClick={apply}>Aplicar selección al formulario</button>
          <button type="button" onClick={() => setPreview(null)}>Descartar vista previa</button>
        </div>
      )}
    </section>
  );
}
