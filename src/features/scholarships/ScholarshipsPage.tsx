import { useCallback, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { useAuth } from "../../app/providers/auth-context";
import { Empty, Field, PageHeading, ResourceState } from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import { assessRequirement, parseRequirements } from "./assessment";
import { getOpenScholarships, type ScholarshipRecord } from "./service";
import type { Tables } from "../../types/database";

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Pendiente de confirmar" :
    new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function isFixture(provenance: unknown): boolean {
  return !!provenance && typeof provenance === "object" &&
    (provenance as Record<string, unknown>).seed_fixture === true;
}

function confirmedAmount(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return record.state === "confirmed" && typeof record.value === "string" ? record.value : null;
}

export function ScholarshipCard({ item, profile }: {
  item: ScholarshipRecord;
  profile: Tables<"profiles"> | null;
}) {
  const { opportunity, details, source } = item;
  const requirements = parseRequirements(details.requirements);
  const assessments = requirements.map((requirement) => assessRequirement(requirement, profile));
  const missing = Array.isArray(details.missing_information) ? details.missing_information : [];
  const amount = confirmedAmount(details.amount);
  return (
    <article className="panel scholarship-card">
      <div className="scholarship-card-header">
        <span className="eyebrow">{opportunity.opportunity_type === "research_internship" ? "PRÁCTICAS DE INVESTIGACIÓN" : opportunity.opportunity_type === "fellowship" ? "AYUDA DE INVESTIGACIÓN" : "BECA"}</span>
        {isFixture(opportunity.provenance) && <span className="muted small">Ficha de demostración</span>}
      </div>
      <h2>{opportunity.title}</h2>
      <p className="muted">{opportunity.provider}</p>
      <p>{opportunity.summary}</p>
      <dl className="scholarship-facts">
        <div><dt>Plazo oficial</dt><dd>{opportunity.official_deadline_date ? formatDate(opportunity.official_deadline_date) : "Pendiente de confirmar"}{opportunity.official_deadline_at ? ` · ${new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(opportunity.official_deadline_at))} (Madrid)` : " · hora no indicada"}</dd></div>
        {opportunity.internal_deadline_at && <div><dt>Plazo interno</dt><dd>{new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(opportunity.internal_deadline_at))} (Madrid)</dd></div>}
        <div><dt>Comprobación</dt><dd>{formatDate(opportunity.checked_at)}</dd></div>
        <div><dt>Fuente</dt><dd>{source?.name ?? opportunity.provider}</dd></div>
        {amount && <div><dt>Importe publicado</dt><dd>{amount}</dd></div>}
        {details.academic_stages.length > 0 && <div><dt>Etapa</dt><dd>{details.academic_stages.join(", ")}</dd></div>}
        {details.degree_areas.length > 0 && <div><dt>Área o titulación</dt><dd>{details.degree_areas.join(", ")}</dd></div>}
      </dl>
      <div className="scholarship-links">
        <a href={opportunity.official_url} target="_blank" rel="noopener noreferrer">Fuente oficial <ExternalLink size={15} aria-hidden="true" /></a>
        {opportunity.bases_url && <a href={opportunity.bases_url} target="_blank" rel="noopener noreferrer">Bases <ExternalLink size={15} aria-hidden="true" /></a>}
        {opportunity.application_url && <a href={opportunity.application_url} target="_blank" rel="noopener noreferrer">Solicitud <ExternalLink size={15} aria-hidden="true" /></a>}
      </div>
      <section className="scholarship-assessment" aria-label={`Requisitos de ${opportunity.title}`}>
        <h3>Requisitos y comparación con mi perfil</h3>
        <p className="muted small">Confirmado significa que la fuente lo publica. Tu perfil solo acredita los datos que has declarado; las ausencias quedan pendientes.</p>
        {assessments.length ? <ul>{assessments.map((item, index) => (
          <li key={`${index}-${item.label}`}>
            <span>{item.label}</span>{" "}
            <strong>{item.sourceState === "confirmed" ? "Fuente confirmada" : "Fuente pendiente"}</strong>{" · "}
            <strong>{item.profileState === "confirmed" ? "Perfil compatible" : item.profileState === "incompatible" ? "Perfil incompatible" : "Perfil sin datos suficientes"}</strong>
            {item.sourceUrl && <> · <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Ver requisito oficial</a></>}
          </li>
        ))}</ul> : <p>La fuente no permite comprobar requisitos específicos todavía.</p>}
        {missing.length > 0 && <div><h4>Datos por confirmar</h4><ul>{missing.map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}</ul></div>}
      </section>
    </article>
  );
}

export function ScholarshipsPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const resource = useResource(useCallback(() => getOpenScholarships(userId), [userId]));
  const [search, setSearch] = useState("");
  const visible = resource.data?.items.filter(({ opportunity }) =>
    `${opportunity.title} ${opportunity.provider} ${opportunity.summary}`.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))) ?? [];
  return <>
    <PageHeading eyebrow="BECAS Y OPORTUNIDADES" title="Investiga tu próximo paso.">
      Convocatorias vigentes con enlace a la fuente oficial. Revisa siempre las bases antes de solicitar.
    </PageHeading>
    <div className="panel explore-filters">
      <Field label="Buscar becas o prácticas">
        <div className="search-input"><Search size={18} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, entidad o temática" /></div>
      </Field>
    </div>
    <ResourceState {...resource} retry={() => void resource.reload()}>
      {visible.length ? <div className="scholarship-list">{visible.map((item) => <ScholarshipCard key={item.opportunity.id} item={item} profile={resource.data?.profile ?? null} />)}</div> : <Empty title="No hay convocatorias vigentes para esta búsqueda.">Prueba otro término o vuelve cuando se haya actualizado el catálogo.</Empty>}
    </ResourceState>
  </>;
}
