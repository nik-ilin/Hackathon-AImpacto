import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  LoaderCircle,
  AlertCircle,
  ArrowUpRight,
  FlaskConical,
} from "lucide-react";
import type { Tables } from "../../types/database";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Notice({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div
      className={`notice ${success ? "notice-success" : ""}`}
      role={success ? "status" : "alert"}
    >
      {!success && <AlertCircle size={18} aria-hidden="true" />}
      <div>{children}</div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} aria-hidden="true" /> Cargando
      información…
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <FlaskConical size={28} aria-hidden="true" />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function TopicPicker({
  topics,
  selected,
  onChange,
}: {
  topics: Tables<"topics">[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="topic-picker">
      <legend>Temáticas científicas</legend>
      <div className="topic-options">
        {topics.map((topic) => (
          <label
            className={`topic-option ${selected.includes(topic.id) ? "selected" : ""}`}
            key={topic.id}
          >
            <input
              type="checkbox"
              checked={selected.includes(topic.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, topic.id]
                    : selected.filter((id) => id !== topic.id),
                )
              }
            />
            {topic.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function GroupCard({
  group,
  matchedTopics = [],
}: {
  group: Tables<"research_groups">;
  matchedTopics?: string[];
}) {
  return (
    <article className="group-card">
      <div className="card-top">
        <span className="group-icon">
          <FlaskConical size={22} aria-hidden="true" />
        </span>
        <span
          className={`badge ${group.accepting_members ? "badge-green" : ""}`}
        >
          {group.accepting_members
            ? "Acepta incorporaciones"
            : "Grupo consolidado"}
        </span>
      </div>
      <h3>
        <Link to={`/groups/${group.id}`}>{group.name}</Link>
      </h3>
      <p className="muted small">
        {[group.institution, group.country].filter(Boolean).join(" · ") ||
          "Institución no indicada"}
      </p>
      <p className="line-clamp">{group.description}</p>
      {matchedTopics.length > 0 && (
        <p className="match-reason">
          Coincide con tus intereses: {matchedTopics.join(", ")}.
        </p>
      )}
      <Link className="text-link card-link" to={`/groups/${group.id}`}>
        Conocer el grupo <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </article>
  );
}
export function ResourceState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string | null;
  retry?: () => void;
  children: ReactNode;
}) {
  if (loading) return <Loading />;
  if (error)
    return (
      <div>
        <Notice>{error}</Notice>
        {retry && (
          <Button variant="secondary" onClick={retry}>
            Volver a intentar
          </Button>
        )}
      </div>
    );
  return children;
}

export function Pagination({
  page,
  hasMore,
  onPage,
  label = "resultados",
}: {
  page: number;
  hasMore: boolean;
  onPage: (page: number) => void;
  label?: string;
}) {
  return (
    <nav className="pagination" aria-label={`Paginación de ${label}`}>
      <Button
        variant="secondary"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        Anterior
      </Button>
      <span>Página {page + 1}</span>
      <Button
        variant="secondary"
        disabled={!hasMore}
        onClick={() => onPage(page + 1)}
      >
        Siguiente
      </Button>
    </nav>
  );
}
