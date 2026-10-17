import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../app/providers/auth-context";
import { Button, Empty, Field, Notice, PageHeading, Pagination, ResourceState } from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import { useMutationIdentity } from "../../hooks/useMutationIdentity";
import { getGroup, getOwnMembership, getProject } from "../../lib/supabase/api";
import { errorMessage } from "../../lib/errors/messages";
import { validationMessage } from "../../lib/validation/schemas";
import { diagnoseNeed, getNeed, listNeeds, markShown, needSchema, saveFeedback, saveNeed, type Diagnosis } from "./service";

export function NeedsPage() {
  const [page, setPage] = useState(0);
  const userId = useAuth().session!.user.id;
  const resource = useResource(useCallback(() => {
    // Identity changes invalidate private results; token refreshes do not.
    if (!userId) return Promise.resolve([]);
    return listNeeds(page);
  }, [page, userId]));
  return <>
    <PageHeading eyebrow="INCORPORACIÓN A LA INVESTIGACIÓN" title="Necesidades de los grupos">
      Compara tus capacidades declaradas con requisitos concretos. La afinidad temática de Explorar grupos conserva su orden habitual.
    </PageHeading>
    <p>Para publicar una necesidad, abre un grupo o proyecto que administras desde <Link to="/my-groups">Mis grupos</Link>.</p>
    <ResourceState {...resource} retry={() => void resource.reload()}>
      {resource.data?.length ? <div className="card-grid">{resource.data.slice(0, 12).map(need => <article className="panel" key={need.id}>
        <h2><Link to={`/needs/${need.id}`}>{need.title}</Link></h2>
        <p>{need.description}</p>
        <p>Capacidades demandadas: {need.required_skills.join(", ") || "Sin especificar"}</p>
        <Link className="text-link" to={`/needs/${need.id}`}>Ver requisitos y comparar mi perfil</Link>
      </article>)}</div> : <Empty title="Sin necesidades abiertas visibles">Los grupos pueden publicar necesidades desde su página.</Empty>}
      <Pagination page={page} hasMore={(resource.data?.length ?? 0) > 12} onPage={setPage} />
    </ResourceState>
  </>;
}

export function NeedFormPage() {
  const { groupId, projectId, needId } = useParams();
  const { session, identityEpoch } = useAuth();
  const userId = session!.user.id;
  const resource = useResource(useCallback(async () => {
    const need = needId ? await getNeed(needId) : null;
    const targetProjectId = need?.project_id ?? projectId;
    const project = targetProjectId ? await getProject(targetProjectId) : null;
    const targetGroupId = need?.group_id ?? project?.group_id ?? groupId ?? "";
    const [group, membership] = await Promise.all([getGroup(targetGroupId), getOwnMembership(targetGroupId, userId)]);
    return { need, project, group, allowed: group.owner_id === userId || membership?.role === "admin" };
  }, [groupId, projectId, needId, userId]));
  return <ResourceState {...resource} retry={() => void resource.reload()}>
    {resource.data && (resource.data.allowed ? <NeedEditor key={`${identityEpoch}:${userId}:${needId ?? projectId ?? groupId}`} userId={userId} data={resource.data} /> : <Notice>Solo el propietario o un administrador puede gestionar necesidades.</Notice>)}
  </ResourceState>;
}
type EditorData = {
  need: Awaited<ReturnType<typeof getNeed>> | null;
  project: Awaited<ReturnType<typeof getProject>> | null;
  group: Awaited<ReturnType<typeof getGroup>>;
};
function NeedEditor({ data, userId }: { data: EditorData; userId: string }) {
  const identity = useMutationIdentity(userId);
  const [title, setTitle] = useState(data.need?.title ?? "");
  const [description, setDescription] = useState(data.need?.description ?? "");
  const [skills, setSkills] = useState(data.need?.required_skills.join(", ") ?? "");
  const [status, setStatus] = useState<"open" | "closed">(data.need?.status ?? "open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = needSchema.safeParse({ title, description, required_skills: skills.split(",").map(s => s.trim()).filter(Boolean), status });
    if (!parsed.success) { setError(validationMessage(parsed.error)); return; }
    setBusy(true); setError(null);
    try {
      const id = await saveNeed(parsed.data, data.group.id, data.project?.id ?? null, identity, data.need?.id);
      if (identity.isCurrent()) navigate(`/needs/${id}`);
    } catch (failure) { if (identity.isCurrent()) setError(errorMessage(failure)); }
    finally { if (identity.isCurrent()) setBusy(false); }
  }
  return <>
    <PageHeading eyebrow={data.group.name} title={data.need ? "Editar necesidad" : "Crear necesidad de incorporación"}>
      {data.project ? `Proyecto: ${data.project.title}.` : "Necesidad del grupo."} La visibilidad depende del grupo y del proyecto asociado.
    </PageHeading>
    <form className="panel form-stack" onSubmit={event => void submit(event)}>
      {error && <Notice>{error}</Notice>}
      <Field label="Título de la necesidad"><input required minLength={3} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></Field>
      <Field label="Descripción de la contribución"><textarea maxLength={10000} rows={5} value={description} onChange={e => setDescription(e.target.value)} /></Field>
      <Field label="Capacidades requeridas" hint="Separadas por comas, por ejemplo Python, SQL. Máximo 50 capacidades de 100 caracteres. Las disciplinas se heredan del grupo o proyecto; no son capacidades."><input maxLength={5050} value={skills} onChange={e => setSkills(e.target.value)} /></Field>
      <Field label="Estado de la necesidad"><select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="open">Abierta</option><option value="closed">Cerrada</option></select></Field>
      <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar necesidad"}</Button>
    </form>
  </>;
}

export function NeedDetailPage() {
  const { needId = "" } = useParams();
  const userId = useAuth().session!.user.id;
  const resource = useResource(useCallback(async () => {
    const need = await getNeed(needId);
    const [group, membership] = await Promise.all([getGroup(need.group_id), getOwnMembership(need.group_id, userId)]);
    return { need, group, allowed: group.owner_id === userId || membership?.role === "admin" };
  }, [needId, userId]));
  const data = resource.data;
  return <ResourceState {...resource} retry={() => void resource.reload()}>{data && <>
    <PageHeading eyebrow="NECESIDAD DE INCORPORACIÓN" title={data.need.title} action={data.allowed ? <Link className="button button-secondary" to={`/needs/${needId}/edit`}>Editar necesidad</Link> : undefined}>
      <Link to={`/groups/${data.group.id}`}>{data.group.name}</Link> · {data.need.status === "open" ? "Abierta" : "Cerrada"}
    </PageHeading>
    <section className="panel">
      <p className="preserve-lines">{data.need.description}</p>
      {data.need.project_id && <Link to={`/projects/${data.need.project_id}`}>Ver proyecto asociado</Link>}
      <h2>Capacidades demandadas</h2><p>{data.need.required_skills.join(", ") || "Sin requisitos de capacidades definidos."}</p>
      <p>La comparación usa las capacidades declaradas en <Link to="/profile">tu perfil</Link>, incluso si es privado. El resultado y tu feedback son personales; no se recomiendan candidatos a terceros.</p>
    </section>
    {data.need.status === "open" ? <PersonalDiagnosis key={`${userId}:${needId}`} needId={needId} /> : <Notice>Esta necesidad está cerrada.</Notice>}
  </>}</ResourceState>;
}

export function PersonalDiagnosis({ needId }: { needId: string }) {
  const { session, identityEpoch } = useAuth();
  const userId = session!.user.id;
  return <PersonalDiagnosisEditor key={`${identityEpoch}:${userId}:${needId}`} needId={needId} userId={userId} />;
}
function PersonalDiagnosisEditor({ needId, userId }: { needId: string; userId: string }) {
  const identity = useMutationIdentity(userId);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<string | null>(null);
  const inFlight = useRef(false);
  async function compare() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    // Retain the same key after network failure; rerenders never create events.
    attempt.current ??= crypto.randomUUID();
    try {
      const next = await diagnoseNeed(needId, attempt.current, identity);
      if (!identity.isCurrent()) return;
      setResult(next); attempt.current = null;
    } catch (failure) { if (identity.isCurrent()) setError(errorMessage(failure)); }
    finally { if (identity.isCurrent()) { inFlight.current = false; setBusy(false); } }
  }
  return <section className="panel form-stack">
    <h2>Diagnóstico personal</h2>
    <p>Comparación literal sin distinguir mayúsculas ni espacios repetidos. No verifica experiencia, nivel ni elegibilidad; los requisitos ausentes son capacidades no declaradas.</p>
    {error && <Notice>{error}</Notice>}
    <Button disabled={busy} onClick={() => void compare()}>{busy ? "Comparando…" : result ? "Actualizar comparación" : "Comparar mi perfil"}</Button>
    {result && <DiagnosisResult key={result.id} result={result} userId={userId} />}
  </section>;
}
function DiagnosisResult({ result, userId }: { result: Diagnosis; userId: string }) {
  const identity = useMutationIdentity(userId);
  const evaluation = result.evaluation;
  const [shown, setShown] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [response, setResponse] = useState<"useful" | "not_useful" | "">("");
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const acknowledge = useCallback(async () => {
    if (!identity.isCurrent()) return;
    try {
      await markShown(result.id, identity);
      if (identity.isCurrent()) { setShown(true); setDisplayError(null); }
    }
    catch (failure) { if (identity.isCurrent()) setDisplayError(errorMessage(failure)); }
  }, [result.id, identity]);
  // A prepared response becomes a shown recommendation only after React commits it.
  // StrictMode/retries are idempotent at the SQL boundary.
  useEffect(() => {
    queueMicrotask(() => { void acknowledge(); });
  }, [acknowledge]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!response || !shown) return;
    setBusy(true); setSaved(false); setFeedbackError(null);
    try {
      await saveFeedback(result.id, response, comment, identity);
      if (identity.isCurrent()) setSaved(true);
    }
    catch (failure) { if (identity.isCurrent()) setFeedbackError(errorMessage(failure)); }
    finally { if (identity.isCurrent()) setBusy(false); }
  }
  return <div className="form-stack">
    <h3>Cobertura de capacidades demandadas</h3>
    <p>{evaluation.coverage === null ? "No evaluable: no se han definido capacidades requeridas." : `${Math.round(evaluation.coverage * 100)} % · ${evaluation.matched_skills.length} de ${evaluation.required_skills.length} capacidades declaradas.`}</p>
    <p><strong>Capacidades que aportas:</strong> {evaluation.matched_skills.join(", ") || "Ninguna coincidencia declarada."}</p>
    <p><strong>Requisitos sin evidencia declarada:</strong> {evaluation.missing_skills.join(", ") || "Ninguno."}</p>
    <p><strong>Otras capacidades declaradas:</strong> {evaluation.additional_skills.join(", ") || "Ninguna."} No aumentan la cobertura.</p>
    <h3>Afinidad temática, por separado</h3>
    <p>{evaluation.matched_topics.join(", ") || "Sin coincidencias temáticas."} No modifica la cobertura de capacidades ni el ranking de grupos.</p>
    <p className="muted small">Evaluación de «{result.context.title}» · {new Date(result.created_at).toLocaleString("es")}. Versión {result.algorithm_version}. Conserva los datos utilizados en esta comparación; actualizar crea una nueva evaluación.</p>
    {displayError && <Notice>No se pudo confirmar el registro de visualización: {displayError} <Button onClick={() => void acknowledge()}>Reintentar registro</Button></Notice>}
    <form className="form-stack" onSubmit={event => void submit(event)}>
      <h3>Tu feedback sobre esta evaluación</h3>
      <Field label="¿Te resulta útil?" hint="Responder es opcional. No responder no se interpreta como rechazo."><select required value={response} onChange={e => { setResponse(e.target.value as typeof response); setSaved(false); }}><option value="">Sin respuesta</option><option value="useful">Sí, útil</option><option value="not_useful">No, poco útil</option></select></Field>
      <Field label="Comentario opcional"><textarea maxLength={2000} value={comment} onChange={e => { setComment(e.target.value); setSaved(false); }} /></Field>
      <Button type="submit" disabled={!shown || !response || busy}>{busy ? "Guardando…" : "Guardar feedback"}</Button>
      {feedbackError && <Notice>{feedbackError}</Notice>}
      {saved && <Notice success>Feedback guardado para esta evaluación.</Notice>}
    </form>
  </div>;
}
