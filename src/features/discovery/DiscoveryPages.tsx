import { useCallback, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Search,
  Plus,
  FlaskConical,
  Network,
  Compass,
} from "lucide-react";
import { useAuth } from "../../app/providers/auth-context";
import {
  Button,
  Empty,
  Field,
  GroupCard,
  Notice,
  PageHeading,
  ResourceState,
} from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import {
  discoverGroups,
  getMyGroups,
  getProfile,
  getTopics,
} from "../../lib/supabase/api";

export function DashboardPage() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const resource = useResource(
    useCallback(async () => {
      const [profile, groups, recommended] = await Promise.all([
        getProfile(userId),
        getMyGroups(userId),
        discoverGroups(userId, "", null, null, 0, 6),
      ]);
      return { profile, groups, recommended };
    }, [userId]),
  );
  return (
    <>
      <PageHeading
        eyebrow="TU ESPACIO CIENTÍFICO"
        title={`Hola${resource.data?.profile?.full_name ? `, ${resource.data.profile.full_name.split(" ")[0]}` : ""}. ¿Qué investigamos hoy?`}
      >
        Cada conexión puede ser el comienzo de algo importante.
      </PageHeading>
      <ResourceState {...resource} retry={() => void resource.reload()}>
        {!resource.data?.profile?.full_name && (
          <Notice>
            Completa tu <Link to="/onboarding">perfil e intereses</Link> para
            encontrar grupos afines.
          </Notice>
        )}
        <section className="dashboard-banner">
          <div>
            <span className="eyebrow">EL SIGUIENTE PASO ES TUYO</span>
            <h2>
              Encuentra personas que
              <br />
              comparten tus preguntas.
            </h2>
            <p>
              Explora grupos, descubre sus proyectos y abre una nueva
              colaboración.
            </p>
            <Link className="button button-primary" to="/explore">
              Explorar grupos <ArrowRight size={18} />
            </Link>
          </div>
          <Network size={132} strokeWidth={0.8} aria-hidden="true" />
        </section>
        <div className="stat-grid">
          <Link to="/my-groups" className="stat-card">
            <FlaskConical size={21} />
            <strong>{resource.data?.groups.ownedTotal ?? 0}</strong>
            <span>Grupos que lideras</span>
          </Link>
          <Link to="/my-groups" className="stat-card">
            <Network size={21} />
            <strong>{resource.data?.groups.joinedTotal ?? 0}</strong>
            <span>Grupos en los que participas</span>
          </Link>
          <Link to="/groups/new" className="stat-card stat-action">
            <Plus size={24} />
            <h3>Una idea, un nuevo grupo.</h3>
            <span>
              Empieza tu propia colaboración <ArrowRight size={15} />
            </span>
          </Link>
        </div>
        <div className="section-row">
          <div>
            <span className="eyebrow">AFINIDAD CIENTÍFICA</span>
            <h2>Grupos para descubrir</h2>
          </div>
          <Link className="text-link" to="/explore">
            Ver todos <ArrowRight size={16} />
          </Link>
        </div>
        <p className="muted section-description">
          Ordenados por coincidencias con tus intereses. Sin coincidencias,
          descubre los grupos más recientes.
        </p>
        {resource.data?.recommended.length ? (
          <div className="card-grid">
            {resource.data.recommended.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                matchedTopics={group.matched_topics}
              />
            ))}
          </div>
        ) : (
          <Empty title="El próximo grupo puede empezar contigo.">
            Todavía no hay grupos públicos.{" "}
            <Link to="/groups/new">Crea el primero</Link>.
          </Empty>
        )}
      </ResourceState>
    </>
  );
}
export function ExplorePage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const topic = params.get("topic") ?? "";
  const accepting = params.get("accepting") === "true";
  const page = Math.max(0, Number(params.get("page")) || 0);
  const [draft, setDraft] = useState({ search, value: search });
  // Only URL q changes replace the draft; filters and token refresh keep typing intact.
  if (draft.search !== search) setDraft({ search, value: search });
  const draftSearch = draft.search === search ? draft.value : search;
  const resource = useResource(
    useCallback(async () => {
      const [groups, topics] = await Promise.all([
        discoverGroups(
          userId,
          search,
          topic || null,
          accepting ? true : null,
          page * 12,
          13,
        ),
        getTopics(),
      ]);
      return { groups, topics };
    }, [userId, search, topic, accepting, page]),
  );
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    filter("q", draftSearch.trim());
  }
  return (
    <>
      <PageHeading
        eyebrow="ENCUENTRA TU PRÓXIMA COLABORACIÓN"
        title="Explora la ciencia que nos conecta."
        action={
          <Link className="button button-primary" to="/groups/new">
            <Plus size={17} />
            Crear grupo
          </Link>
        }
      >
        Grupos con preguntas, disciplinas y posibilidades por descubrir.
      </PageHeading>
      {params.get("view") === "projects" && (
        <Notice success>
          Abre un grupo para explorar sus proyectos y líneas de investigación.
        </Notice>
      )}
      <form className="explore-filters panel" onSubmit={submit}>
        <Field label="Buscar un grupo">
          <div className="search-input">
            <Search size={18} aria-hidden="true" />
            <input
              placeholder="Nombre o línea de investigación"
              value={draftSearch}
              onChange={(event) =>
                setDraft({ search, value: event.target.value })
              }
              maxLength={200}
            />
          </div>
        </Field>
        <Field label="Disciplina">
          <select
            value={topic}
            onChange={(event) => filter("topic", event.target.value)}
          >
            <option value="">Todas las disciplinas</option>
            {resource.data?.topics.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={accepting}
            onChange={(event) =>
              filter("accepting", event.target.checked ? "true" : "")
            }
          />
          Aceptan incorporaciones
        </label>
        <Button type="submit">
          <Search size={17} />
          Buscar
        </Button>
      </form>
      <ResourceState {...resource} retry={() => void resource.reload()}>
        <div className="results-heading">
          <Compass size={18} />
          <span>
            {resource.data?.groups.length
              ? "Grupos que pueden interesarte"
              : "Sin resultados para estos filtros"}
          </span>
          <span className="muted small">Página {page + 1}</span>
        </div>
        {resource.data?.groups.length ? (
          <div className="card-grid">
            {resource.data.groups.slice(0, 12).map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                matchedTopics={group.matched_topics}
              />
            ))}
          </div>
        ) : (
          <Empty title="Todavía no encontramos ese grupo.">
            Prueba otra disciplina o amplía tu búsqueda.
          </Empty>
        )}
        <div className="pagination">
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("page", String(page - 1));
              setParams(next);
            }}
          >
            Anterior
          </Button>
          <span>Página {page + 1}</span>
          <Button
            variant="secondary"
            disabled={!resource.data || resource.data.groups.length <= 12}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("page", String(page + 1));
              setParams(next);
            }}
          >
            Siguiente
          </Button>
        </div>
      </ResourceState>
    </>
  );
}
