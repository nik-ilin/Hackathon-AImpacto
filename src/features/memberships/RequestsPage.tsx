import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/providers/auth-context";
import {
  Button,
  Empty,
  Notice,
  PageHeading,
  ResourceState,
  Pagination,
} from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import {
  cancelRequest,
  decideRequest,
  getRequests,
} from "../../lib/supabase/api";
import { errorMessage } from "../../lib/errors/messages";
import type { Tables } from "../../types/database";

const statusLabels = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};
export function RequestsPage() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [page, setPage] = useState(0);
  const resource = useResource(
    useCallback(() => getRequests(userId, page), [userId, page]),
  );
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function act(
    id: string,
    action: "approved" | "rejected" | "cancelled",
  ) {
    setBusy(id);
    setError(null);
    setSuccess(null);
    try {
      if (action === "cancelled") await cancelRequest(id);
      else await decideRequest(id, action);
      setSuccess(
        {
          approved: "Solicitud aprobada. La persona ya forma parte del grupo.",
          rejected: "Solicitud rechazada. El historial se conserva.",
          cancelled: "Solicitud cancelada.",
        }[action],
      );
      await resource.reload();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  }
  function requestCard(request: Tables<"group_join_requests">) {
    const group = resource.data?.groups.find(
      (item) => item.id === request.group_id,
    );
    const person =
      resource.data?.profiles.find(
        (profile) => profile.id === request.applicant_id,
      )?.full_name || `Participante ${request.applicant_id.slice(0, 8)}`;
    return (
      <article className="request-card panel" key={request.id}>
        <div className="section-row">
          <div>
            <span className="eyebrow">
              {tab === "received" ? person : "TU SOLICITUD"}
            </span>
            <h3>
              {group ? (
                <Link to={`/groups/${group.id}`}>{group.name}</Link>
              ) : (
                "Grupo no disponible"
              )}
            </h3>
          </div>
          <span
            className={`badge ${request.status === "approved" ? "badge-green" : ""}`}
          >
            {statusLabels[request.status]}
          </span>
        </div>
        {request.message && <p className="preserve-lines">{request.message}</p>}
        <p className="muted small">
          Enviada el{" "}
          {new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(
            new Date(request.created_at),
          )}
          {request.decided_at &&
            ` · Resuelta el ${new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(request.decided_at))}`}
        </p>
        {request.status === "pending" && (
          <div className="form-actions">
            {tab === "received" ? (
              <>
                <Button
                  disabled={busy !== null}
                  onClick={() => void act(request.id, "approved")}
                >
                  {busy === request.id
                    ? "Procesando…"
                    : "Aprobar incorporación"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void act(request.id, "rejected")}
                >
                  Rechazar
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void act(request.id, "cancelled")}
              >
                {busy === request.id ? "Cancelando…" : "Cancelar solicitud"}
              </Button>
            )}
          </div>
        )}
      </article>
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="CONEXIONES CON PROPÓSITO"
        title="Solicitudes de incorporación"
      >
        Revisa las incorporaciones a los grupos que gestionas y sigue tus
        propias solicitudes.
      </PageHeading>
      <div className="tabs" role="group" aria-label="Tipo de solicitudes">
        <Button
          variant="secondary"
          className={tab === "received" ? "tab-active" : ""}
          onClick={() => {
            setTab("received");
            setPage(0);
          }}
          aria-pressed={tab === "received"}
        >
          Recibidas
        </Button>
        <Button
          variant="secondary"
          className={tab === "sent" ? "tab-active" : ""}
          onClick={() => {
            setTab("sent");
            setPage(0);
          }}
          aria-pressed={tab === "sent"}
        >
          Enviadas
        </Button>
      </div>
      {error && <Notice>{error}</Notice>}
      {success && <Notice success>{success}</Notice>}
      <ResourceState {...resource} retry={() => void resource.reload()}>
        {resource.data?.[tab].length ? (
          <div className="request-list">
            {resource.data[tab].slice(0, 12).map(requestCard)}
          </div>
        ) : (
          <Empty
            title={
              tab === "received"
                ? "No tienes solicitudes recibidas."
                : "Todavía no has enviado solicitudes."
            }
          >
            {tab === "received" ? (
              "Las solicitudes a los grupos que lideras o administras aparecerán aquí."
            ) : (
              <Link to="/explore">Encuentra un grupo para empezar</Link>
            )}
          </Empty>
        )}
        <Pagination
          page={page}
          hasMore={(resource.data?.[tab].length ?? 0) > 12}
          onPage={setPage}
          label="solicitudes"
        />
      </ResourceState>
    </>
  );
}
