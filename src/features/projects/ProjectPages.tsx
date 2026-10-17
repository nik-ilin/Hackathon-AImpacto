import { useCallback, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import type { z } from "zod";
import type { Tables } from "../../types/database";
import { useAuth } from "../../app/providers/auth-context";
import {
  Button,
  Field,
  Notice,
  PageHeading,
  ResourceState,
  TopicPicker,
} from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import { useMutationIdentity } from "../../hooks/useMutationIdentity";
import {
  getGroup,
  getOwnMembership,
  getProject,
  getProjectTopics,
  getTopics,
  saveProject,
} from "../../lib/supabase/api";
import { errorMessage } from "../../lib/errors/messages";
import { projectSchema, validationMessage } from "../../lib/validation/schemas";

const projectInitial: z.infer<typeof projectSchema> = {
  title: "",
  description: "",
  status: "draft",
  visibility: "private",
  funding_needed_amount: "",
  funding_currency: "",
};
export function ProjectFormPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const params = useParams();
  const projectId = params.projectId;
  const resource = useResource(
    useCallback(async () => {
      const project = projectId ? await getProject(projectId) : null;
      const groupId = project?.group_id ?? params.groupId ?? "";
      const [group, membership, topics, selected] = await Promise.all([
        getGroup(groupId),
        getOwnMembership(groupId, userId),
        getTopics(),
        projectId ? getProjectTopics(projectId) : Promise.resolve([]),
      ]);
      return { project, group, membership, topics, selected };
    }, [projectId, params.groupId, userId]),
  );
  return (
    <ResourceState {...resource} retry={() => void resource.reload()}>
      {resource.data && (
        <ProjectEditor
          key={`${userId}:${projectId ?? resource.data.group.id}`}
          userId={userId}
          projectId={projectId}
          data={resource.data}
        />
      )}
    </ResourceState>
  );
}
function ProjectEditor({
  userId,
  projectId,
  data,
}: {
  userId: string;
  projectId: string | undefined;
  data: {
    project: Tables<"research_projects"> | null;
    group: Tables<"research_groups">;
    membership: Tables<"group_memberships"> | null;
    topics: Tables<"topics">[];
    selected: string[];
  };
}) {
  const identity = useMutationIdentity(userId);
  const navigate = useNavigate();
  const project = data.project;
  const [values, setValues] = useState<z.infer<typeof projectSchema>>(() =>
    project
      ? {
          title: project.title,
          description: project.description,
          status: project.status,
          visibility: project.visibility,
          funding_needed_amount:
            project.funding_needed_amount === null
              ? ""
              : String(project.funding_needed_amount),
          funding_currency: project.funding_currency ?? "",
        }
      : projectInitial,
  );
  const [selected, setSelected] = useState(data.selected);
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
    const parsed = projectSchema.safeParse(values);
    if (!parsed.success) {
      setError(validationMessage(parsed.error));
      return;
    }
    setBusy(true);
    try {
      const id = await saveProject(
        parsed.data,
        selected,
        data.group.id,
        identity,
        projectId,
      );
      if (identity.isCurrent()) navigate(`/projects/${id}`);
    } catch (failure) {
      if (identity.isCurrent()) setError(errorMessage(failure));
    } finally {
      if (identity.isCurrent()) setBusy(false);
    }
  }
  const allowed =
    data.group.owner_id === userId || data.membership?.role === "admin";
  return (
    <>
      <PageHeading
        eyebrow="DE LA IDEA A LA INVESTIGACIÓN"
        title={projectId ? "Editar proyecto" : "Crear proyecto"}
      >
        {data.group.name
          ? `Un nuevo paso para ${data.group.name}.`
          : "Da forma a una línea de investigación de tu grupo."}
      </PageHeading>

      {!allowed ? (
        <Notice>
          Solo el propietario o un administrador del grupo puede gestionar
          proyectos.
        </Notice>
      ) : (
        <form
          className="panel form-stack"
          onSubmit={(event) => void submit(event)}
        >
          {error && <Notice>{error}</Notice>}
          <Field label="Título del proyecto">
            <input
              required
              minLength={3}
              maxLength={200}
              value={values.title}
              onChange={(event) => update("title", event.target.value)}
            />
          </Field>
          <Field label="Descripción">
            <textarea
              required
              minLength={20}
              maxLength={10000}
              rows={7}
              value={values.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Pregunta científica, objetivos y posibles líneas de trabajo."
            />
          </Field>
          <TopicPicker
            topics={data.topics ?? []}
            selected={selected}
            onChange={setSelected}
          />
          <div className="form-grid">
            <Field label="Estado">
              <select
                value={values.status}
                onChange={(event) =>
                  update("status", event.target.value as typeof values.status)
                }
              >
                <option value="draft">Borrador</option>
                <option value="active">Activo</option>
                <option value="completed">Completado</option>
              </select>
            </Field>
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
                <option value="private">
                  Privado: integrantes autorizados del grupo
                </option>
                <option value="public">Público</option>
              </select>
            </Field>
            <Field label="Financiación necesaria (opcional)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={values.funding_needed_amount}
                onChange={(event) =>
                  update("funding_needed_amount", event.target.value)
                }
              />
            </Field>
            <Field
              label="Moneda"
              hint="Código ISO de tres letras. Por ejemplo, EUR o USD."
            >
              <input
                value={values.funding_currency}
                onChange={(event) =>
                  update("funding_currency", event.target.value.toUpperCase())
                }
                maxLength={3}
                placeholder="EUR"
              />
            </Field>
          </div>
          {data.group.visibility === "private" && (
            <Notice success>
              El grupo es privado: un proyecto público no puede descubrirse
              públicamente mientras el grupo siga siendo privado. La visibilidad
              del proyecto solo cambia cuando la eliges y guardas
              explícitamente.
            </Notice>
          )}
          <p className="muted small">
            La financiación se registra para describir las necesidades del
            proyecto. El matching de convocatorias llegará en una próxima etapa.
          </p>
          <div className="form-actions">
            <Button disabled={busy} type="submit">
              {busy
                ? "Guardando…"
                : projectId
                  ? "Guardar proyecto"
                  : "Crear proyecto"}
            </Button>
            <Link
              className="text-link"
              to={data ? `/groups/${data.group.id}` : "/my-groups"}
            >
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const resource = useResource(
    useCallback(async () => {
      const project = await getProject(projectId);
      const [group, membership, topics, selected] = await Promise.all([
        getGroup(project.group_id),
        getOwnMembership(project.group_id, userId),
        getTopics(),
        getProjectTopics(projectId),
      ]);
      return {
        project,
        group,
        membership,
        topics: topics.filter((topic) => selected.includes(topic.id)),
      };
    }, [projectId, userId]),
  );
  const data = resource.data;
  const allowed =
    data?.group.owner_id === userId || data?.membership?.role === "admin";
  return (
    <ResourceState {...resource} retry={() => void resource.reload()}>
      {data && (
        <>
          <Link className="text-link back-link" to={`/groups/${data.group.id}`}>
            <ArrowLeft size={16} />
            {data.group.name}
          </Link>
          <PageHeading
            eyebrow="PROYECTO DE INVESTIGACIÓN"
            title={data.project.title}
            action={
              allowed ? (
                <Link
                  className="button button-secondary"
                  to={`/projects/${projectId}/edit`}
                >
                  Editar proyecto
                </Link>
              ) : undefined
            }
          >
            {data.group.name}
          </PageHeading>
          <section className="panel project-detail">
            <div className="badge-row">
              <span className="badge badge-green">
                {
                  {
                    draft: "Borrador",
                    active: "Activo",
                    completed: "Completado",
                  }[data.project.status]
                }
              </span>
              <span className="badge">
                <LockKeyhole size={13} />
                {data.project.visibility === "public" ? "Público" : "Privado"}
              </span>
            </div>
            <h2>Sobre el proyecto</h2>
            <p className="preserve-lines">{data.project.description}</p>
            <div className="badge-row">
              {data.topics.map((topic) => (
                <span key={topic.id} className="topic-tag">
                  {topic.name}
                </span>
              ))}
            </div>
            {data.project.funding_needed_amount !== null && (
              <div className="funding-box">
                <span className="eyebrow">NECESIDADES DE FINANCIACIÓN</span>
                <strong>
                  {new Intl.NumberFormat("es", {
                    maximumFractionDigits: 2,
                  }).format(data.project.funding_needed_amount)}{" "}
                  {data.project.funding_currency}
                </strong>
                <p>
                  Importe declarado por el grupo. Las herramientas de búsqueda
                  de convocatorias están previstas para una próxima etapa.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </ResourceState>
  );
}
