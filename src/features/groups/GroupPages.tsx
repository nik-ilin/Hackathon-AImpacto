import { useCallback, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  MapPin,
  LockKeyhole,
  Users,
  Crown,
} from "lucide-react";
import type { z } from "zod";
import type { Tables } from "../../types/database";
import { useAuth } from "../../app/providers/auth-context";
import {
  Button,
  Empty,
  Field,
  GroupCard,
  Notice,
  PageHeading,
  ResourceState,
  Pagination,
  TopicPicker,
} from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import {
  getGroup,
  getGroupMembers,
  getOwnMembership,
  getGroupProjects,
  getGroupRequest,
  getGroupTopics,
  getMyGroups,
  getTopics,
  getVisibleProfiles,
  requestToJoin,
  saveGroup,
} from "../../lib/supabase/api";
import { errorMessage } from "../../lib/errors/messages";
import {
  groupSchema,
  joinRequestSchema,
  validationMessage,
} from "../../lib/validation/schemas";

export function MyGroupsPage() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [page, setPage] = useState(0);
  const resource = useResource(
    useCallback(() => getMyGroups(userId, page), [userId, page]),
  );
  return (
    <>
      <PageHeading
        eyebrow="COLABORACIÓN EN MARCHA"
        title="Mis grupos"
        action={
          <Link className="button button-primary" to="/groups/new">
            <Plus size={18} />
            Crear grupo
          </Link>
        }
      >
        Puedes liderar varios grupos y participar en otros con la misma cuenta.
      </PageHeading>
      <ResourceState {...resource} retry={() => void resource.reload()}>
        <h2 className="section-title">
          Grupos que lidero{" "}
          <span className="count">{resource.data?.ownedTotal ?? 0}</span>
        </h2>
        {resource.data?.owned.length ? (
          <div className="card-grid">
            {resource.data.owned.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <Empty title="Tu próxima idea puede tener su propio grupo.">
            <Link to="/groups/new">Crea un grupo de investigación</Link>.
          </Empty>
        )}
        <h2 className="section-title spaced">
          Grupos en los que participo{" "}
          <span className="count">{resource.data?.joinedTotal ?? 0}</span>
        </h2>
        {resource.data?.joined.length ? (
          <div className="card-grid">
            {resource.data.joined.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <Empty title="Encuentra un equipo con tus mismos intereses.">
            <Link to="/explore">Explora grupos</Link> y solicita una
            incorporación.
          </Empty>
        )}
        <Pagination
          page={page}
          hasMore={
            Math.max(
              resource.data?.ownedTotal ?? 0,
              resource.data?.joinedTotal ?? 0,
            ) >
            (page + 1) * 12
          }
          onPage={setPage}
          label="mis grupos"
        />
      </ResourceState>
    </>
  );
}
const groupInitial: z.infer<typeof groupSchema> = {
  name: "",
  description: "",
  institution: "",
  country: "",
  visibility: "public",
  accepting_members: true,
};
export function GroupFormPage() {
  const { groupId } = useParams();
  const resource = useResource(
    useCallback(async () => {
      const [topics, group, selected] = await Promise.all([
        getTopics(),
        groupId ? getGroup(groupId) : Promise.resolve(null),
        groupId ? getGroupTopics(groupId) : Promise.resolve([]),
      ]);
      return { topics, group, selected };
    }, [groupId]),
  );
  return (
    <ResourceState {...resource} retry={() => void resource.reload()}>
      {resource.data && (
        <GroupEditor
          key={groupId ?? "new"}
          groupId={groupId}
          group={resource.data.group}
          topics={resource.data.topics}
          initialSelected={resource.data.selected}
        />
      )}
    </ResourceState>
  );
}
function GroupEditor({
  groupId,
  group,
  topics,
  initialSelected,
}: {
  groupId: string | undefined;
  group: Tables<"research_groups"> | null;
  topics: Tables<"topics">[];
  initialSelected: string[];
}) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<z.infer<typeof groupSchema>>(() =>
    group
      ? {
          name: group.name,
          description: group.description,
          institution: group.institution,
          country: group.country,
          visibility: group.visibility,
          accepting_members: group.accepting_members,
        }
      : groupInitial,
  );
  const [selected, setSelected] = useState(initialSelected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function update<K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K],
  ) {
    setValues((old) => ({ ...old, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = groupSchema.safeParse(values);
    if (!parsed.success) {
      setError(validationMessage(parsed.error));
      return;
    }
    setBusy(true);
    try {
      const id = await saveGroup(parsed.data, selected, groupId);
      navigate(`/groups/${id}`, { state: { saved: true } });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const allowed = !group || group.owner_id === session!.user.id;
  return (
    <>
      <PageHeading
        eyebrow="DA FORMA A TU COLABORACIÓN"
        title={groupId ? "Editar grupo" : "Crea un grupo de investigación"}
      >
        Cualquier persona puede liderar un grupo. Empieza por una pregunta que
        merezca explorarse juntos.
      </PageHeading>

      {!allowed ? (
        <Notice>Solo el propietario puede editar este grupo.</Notice>
      ) : (
        <form
          className="panel form-stack"
          onSubmit={(event) => void submit(event)}
        >
          {error && <Notice>{error}</Notice>}
          <Field label="Nombre del grupo">
            <input
              required
              minLength={3}
              maxLength={160}
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Un nombre para vuestra línea de investigación"
            />
          </Field>
          <Field label="Descripción">
            <textarea
              required
              minLength={20}
              maxLength={6000}
              rows={6}
              value={values.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Qué investigáis, cómo trabajáis y qué colaboradores buscáis."
            />
          </Field>
          <div className="form-grid">
            <Field label="Institución">
              <input
                maxLength={200}
                value={values.institution}
                onChange={(event) => update("institution", event.target.value)}
              />
            </Field>
            <Field label="País">
              <input
                maxLength={100}
                value={values.country}
                onChange={(event) => update("country", event.target.value)}
              />
            </Field>
          </div>
          <TopicPicker
            topics={topics}
            selected={selected}
            onChange={setSelected}
          />
          <Field label="Visibilidad">
            <select
              value={values.visibility}
              onChange={(event) =>
                update(
                  "visibility",
                  event.target.value as typeof values.visibility,
                )
              }
            >
              <option value="public">Público: aparece en exploración</option>
              <option value="private">
                Privado: solo propietario y miembros
              </option>
            </select>
          </Field>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={values.accepting_members}
              onChange={(event) =>
                update("accepting_members", event.target.checked)
              }
            />
            El grupo acepta solicitudes de incorporación
          </label>
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              {busy
                ? "Guardando…"
                : groupId
                  ? "Guardar cambios"
                  : "Crear grupo"}
            </Button>
            <Link
              className="text-link"
              to={groupId ? `/groups/${groupId}` : "/my-groups"}
            >
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
export function GroupDetailPage() {
  const { groupId } = useParams();
  return <GroupDetail key={groupId} />;
}
function GroupDetail() {
  const { groupId = "" } = useParams();
  const { session } = useAuth();
  const userId = session!.user.id;
  const [membersPage, setMembersPage] = useState(0);
  const [projectsPage, setProjectsPage] = useState(0);
  const resource = useResource(
    useCallback(async () => {
      const [
        group,
        members,
        projects,
        request,
        selected,
        topics,
        ownMembership,
      ] = await Promise.all([
        getGroup(groupId),
        getGroupMembers(groupId, membersPage),
        getGroupProjects(groupId, projectsPage),
        getGroupRequest(groupId, userId),
        getGroupTopics(groupId),
        getTopics(),
        getOwnMembership(groupId, userId),
      ]);
      const profiles = await getVisibleProfiles([
        group.owner_id,
        ...members.map((member) => member.user_id),
      ]);
      return {
        group,
        members,
        ownMembership,
        projects,
        request,
        topics: topics.filter((topic) => selected.includes(topic.id)),
        profiles,
      };
    }, [groupId, userId, membersPage, projectsPage]),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const data = resource.data;
  const own = data?.group.owner_id === userId;
  const membership = data?.ownMembership;
  const manages = own || membership?.role === "admin";
  function person(id: string) {
    return (
      data?.profiles.find((profile) => profile.id === id)?.full_name ||
      `Participante ${id.slice(0, 8)}`
    );
  }
  async function join(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = joinRequestSchema.safeParse(message);
    if (!parsed.success) {
      setError(validationMessage(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await requestToJoin(groupId, parsed.data);
      setSuccess(true);
      await resource.reload();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="text-link back-link" to="/explore">
        <ArrowLeft size={16} />
        Explorar grupos
      </Link>
      <ResourceState {...resource} retry={() => void resource.reload()}>
        {data && (
          <>
            <PageHeading
              eyebrow="GRUPO DE INVESTIGACIÓN"
              title={data.group.name}
              action={
                own ? (
                  <Link
                    className="button button-secondary"
                    to={`/groups/${groupId}/edit`}
                  >
                    Editar grupo
                  </Link>
                ) : undefined
              }
            >
              <span className="inline-icon">
                <MapPin size={16} />
                {[data.group.institution, data.group.country]
                  .filter(Boolean)
                  .join(" · ") || "Institución no indicada"}
              </span>
            </PageHeading>
            {manages && <p><Link className="button button-secondary" to={`/groups/${groupId}/needs/new`}>Crear necesidad de incorporación</Link></p>}
            <p><Link className="text-link" to="/needs">Explorar necesidades de incorporación</Link></p>
            <div className="detail-layout">
              <div className="detail-main">
                <section className="panel">
                  <div className="badge-row">
                    <span
                      className={`badge ${data.group.accepting_members ? "badge-green" : ""}`}
                    >
                      {data.group.accepting_members
                        ? "Acepta incorporaciones"
                        : "Sin incorporaciones abiertas"}
                    </span>
                    <span className="badge">
                      <LockKeyhole size={13} />
                      {data.group.visibility === "public"
                        ? "Público"
                        : "Privado"}
                    </span>
                  </div>
                  <h2>Una pregunta compartida</h2>
                  <p className="preserve-lines">{data.group.description}</p>
                  <div className="badge-row">
                    {data.topics.map((topic) => (
                      <Link
                        className="topic-tag"
                        key={topic.id}
                        to={`/explore?topic=${topic.id}`}
                      >
                        {topic.name}
                      </Link>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="section-row">
                    <h2>Proyectos del grupo</h2>
                    {manages && (
                      <Link
                        className="text-link"
                        to={`/groups/${groupId}/projects/new`}
                      >
                        <Plus size={16} />
                        Crear proyecto
                      </Link>
                    )}
                  </div>
                  {data.projects.length ? (
                    <div className="project-list">
                      {data.projects.slice(0, 8).map((project) => (
                        <Link
                          className="project-item"
                          key={project.id}
                          to={`/projects/${project.id}`}
                        >
                          <div>
                            <h3>{project.title}</h3>
                            <p className="muted line-clamp">
                              {project.description}
                            </p>
                          </div>
                          <span className="badge">
                            {
                              {
                                draft: "Borrador",
                                active: "Activo",
                                completed: "Completado",
                              }[project.status]
                            }
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Empty title="Las próximas ideas se construirán aquí.">
                      No hay proyectos visibles en este grupo.
                    </Empty>
                  )}
                  <Pagination
                    page={projectsPage}
                    hasMore={data.projects.length > 8}
                    onPage={setProjectsPage}
                    label="proyectos"
                  />
                </section>
              </div>
              <aside className="detail-sidebar">
                <section className="panel">
                  <h2>
                    <Users size={19} />
                    El equipo
                  </h2>
                  <div className="member-row">
                    <span className="avatar">
                      <Crown size={18} />
                    </span>
                    <div>
                      <strong>{person(data.group.owner_id)}</strong>
                      <small>Propietario/a</small>
                    </div>
                  </div>
                  {data.members.slice(0, 8).map((member) => (
                    <div className="member-row" key={member.id}>
                      <span className="avatar">
                        {person(member.user_id).charAt(0)}
                      </span>
                      <div>
                        <strong>{person(member.user_id)}</strong>
                        <small>
                          {member.role === "admin"
                            ? "Administrador/a"
                            : "Miembro"}
                        </small>
                      </div>
                    </div>
                  ))}
                  <p className="muted small">
                    Propietario por separado de los miembros.
                  </p>
                  <Pagination
                    page={membersPage}
                    hasMore={data.members.length > 8}
                    onPage={setMembersPage}
                    label="miembros"
                  />
                </section>
                {manages ? (
                  <section className="panel">
                    <h3>Gestiona la colaboración</h3>
                    <p className="muted">
                      Revisa las solicitudes recibidas y conoce a quienes
                      quieren sumarse.
                    </p>
                    <Link className="button button-secondary" to="/requests">
                      Ver solicitudes
                    </Link>
                  </section>
                ) : membership ? (
                  <Notice success>Ya formas parte de este grupo.</Notice>
                ) : data.request || success ? (
                  <Notice success>
                    Tu solicitud está pendiente. Puedes consultarla o cancelarla
                    en <Link to="/requests">Solicitudes</Link>.
                  </Notice>
                ) : data.group.accepting_members ? (
                  <form
                    className="panel form-stack"
                    onSubmit={(event) => void join(event)}
                  >
                    <h3>Encuentra tu lugar en el equipo</h3>
                    {error && <Notice>{error}</Notice>}
                    <Field label="Presentación (opcional)">
                      <textarea
                        rows={4}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        maxLength={2000}
                        placeholder="Comparte tu interés por el grupo."
                      />
                    </Field>
                    <Button type="submit" disabled={busy}>
                      {busy ? "Enviando…" : "Solicitar incorporación"}
                    </Button>
                  </form>
                ) : (
                  <Notice success>
                    Este grupo no acepta solicitudes en este momento.
                  </Notice>
                )}
              </aside>
            </div>
          </>
        )}
      </ResourceState>
    </>
  );
}
