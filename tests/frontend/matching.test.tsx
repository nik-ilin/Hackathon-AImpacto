// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NeedDetailPage, NeedFormPage, PersonalDiagnosis } from "../../src/features/matching/MatchingPages";
import * as service from "../../src/features/matching/service";
import * as api from "../../src/lib/supabase/api";

const auth = vi.hoisted(() => ({ identityEpoch: 0, session: { user: { id: "owner" }, access_token: "first" } }));
vi.mock("../../src/app/providers/auth-context", () => ({ useAuth: () => auth }));
vi.mock("../../src/lib/supabase/api", () => ({ getGroup: vi.fn(), getOwnMembership: vi.fn(), getProject: vi.fn() }));
vi.mock("../../src/features/matching/service", async importOriginal => ({
  ...await importOriginal<typeof service>(),
  diagnoseNeed: vi.fn(), markShown: vi.fn(), saveFeedback: vi.fn(), saveNeed: vi.fn(), getNeed: vi.fn(),
}));
const diagnosis: service.Diagnosis = {
  id: "event-1", actor_id: "owner", need_id: "need-1", impression_key: "key", algorithm_version: "skills-v1",
  created_at: "2026-10-17T12:00:00Z", shown_at: null, context: { kind: "recruitment", need_id: "need-1", title: "Python aplicado", description: "Contribución", group_id: "group-1", group_name: "Grupo", project_id: null, project_title: null, required_skills: ["python", "sql"], declared_skills: ["python", "julia"], need_updated_at: "2026-10-17T12:00:00Z" },
  evaluation: { required_skills: ["python", "sql"], matched_skills: ["python"], missing_skills: ["sql"], additional_skills: ["julia"], coverage: 0.5, matched_topics: ["Física"] },
};
beforeEach(() => {
  vi.resetAllMocks();
  auth.session = { user: { id: "owner" }, access_token: "first" };
  auth.identityEpoch = 0;
  vi.mocked(service.diagnoseNeed).mockResolvedValue(diagnosis);
  vi.mocked(service.markShown).mockResolvedValue(undefined);
  vi.mocked(service.saveFeedback).mockResolvedValue(undefined);
  vi.mocked(service.saveNeed).mockResolvedValue("need-1");
  vi.mocked(api.getGroup).mockResolvedValue({ id: "group-1", owner_id: "owner", name: "Grupo", description: "", institution: "", country: "", visibility: "public", accepting_members: true, created_at: "", updated_at: "" });
  vi.mocked(api.getOwnMembership).mockResolvedValue(null);
  vi.mocked(service.getNeed).mockResolvedValue({ id: "need-1", group_id: "group-1", project_id: null, title: "Python aplicado", description: "Contribución", required_skills: ["Python", "SQL"], status: "open", created_at: "", updated_at: "" });
});
afterEach(cleanup);
async function compare() {
  fireEvent.click(screen.getByRole("button", { name: "Comparar mi perfil" }));
  await screen.findByText("50 % · 1 de 2 capacidades declaradas.");
}
function detail() {
  return <MemoryRouter initialEntries={["/needs/need-1"]}><Routes><Route path="/needs/:needId" element={<NeedDetailPage />} /></Routes></MemoryRouter>;
}
describe("Diagnóstico personal y feedback explícito", () => {
  it("registra después de renderizar y conserva evaluación sin duplicar tras refresh de sesión", async () => {
    vi.mocked(service.markShown).mockImplementation(async () => {
      expect(screen.getByText("50 % · 1 de 2 capacidades declaradas.")).toBeTruthy();
    });
    const view = render(detail());
    await screen.findByRole("button", { name: "Comparar mi perfil" });
    expect(service.diagnoseNeed).not.toHaveBeenCalled();
    await compare();
    expect(screen.getByText("Capacidades que aportas:").parentElement?.textContent).toContain("python");
    expect(screen.getByText("Requisitos sin evidencia declarada:").parentElement?.textContent).toContain("sql");
    expect(screen.getByText("Otras capacidades declaradas:").parentElement?.textContent).toContain("julia");
    expect(screen.getByText(/No modifica la cobertura/).textContent).toContain("Física");
    auth.session = { user: { id: "owner" }, access_token: "renewed" };
    view.rerender(detail());
    await act(async () => {});
    expect(service.diagnoseNeed).toHaveBeenCalledTimes(1);
    expect(service.markShown).toHaveBeenCalledExactlyOnceWith("event-1", expect.objectContaining({ userId: "owner" }));
    expect(service.getNeed).toHaveBeenCalledTimes(1);
    expect(service.saveFeedback).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Guardar feedback" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("¿Te resulta útil?", { exact: false }), { target: { value: "useful" } });
    fireEvent.change(screen.getByLabelText("Comentario opcional"), { target: { value: "Comparación clara" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar feedback" }));
    await screen.findByText("Feedback guardado para esta evaluación.");
    expect(service.saveFeedback).toHaveBeenCalledExactlyOnceWith("event-1", "useful", "Comparación clara", expect.objectContaining({ userId: "owner" }));
  });
  it("reintenta confirmar visualización sin recalcular y bloquea feedback hasta confirmación", async () => {
    vi.mocked(service.markShown).mockRejectedValueOnce(new Error("Sin conexión"));
    render(<PersonalDiagnosis needId="need-1" />);
    await compare();
    fireEvent.change(screen.getByLabelText("¿Te resulta útil?", { exact: false }), { target: { value: "not_useful" } });
    expect((screen.getByRole("button", { name: "Guardar feedback" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar registro" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Guardar feedback" }) as HTMLButtonElement).disabled).toBe(false));
    expect(service.markShown).toHaveBeenCalledTimes(2);
    expect(service.diagnoseNeed).toHaveBeenCalledTimes(1);
    expect(service.saveFeedback).not.toHaveBeenCalled();
  });
  it("reutiliza key tras fallo incierto y crea otra solo al actualizar comparación", async () => {
    vi.mocked(service.diagnoseNeed).mockRejectedValueOnce(new Error("Respuesta perdida"));
    render(<PersonalDiagnosis needId="need-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Comparar mi perfil" }));
    await screen.findByText("Respuesta perdida");
    await compare();
    const calls = vi.mocked(service.diagnoseNeed).mock.calls;
    expect(calls[0][1]).toBe(calls[1][1]);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar comparación" }));
    await waitFor(() => expect(service.diagnoseNeed).toHaveBeenCalledTimes(3));
    expect(calls[2][1]).not.toBe(calls[1][1]);
  });
  it("un doble click mientras espera solo crea un diagnóstico", async () => {
    let resolve!: (value: service.Diagnosis) => void;
    vi.mocked(service.diagnoseNeed).mockReturnValue(new Promise(done => { resolve = done; }));
    render(<PersonalDiagnosis needId="need-1" />);
    const button = screen.getByRole("button", { name: "Comparar mi perfil" });
    fireEvent.click(button); fireEvent.click(button);
    expect(service.diagnoseNeed).toHaveBeenCalledTimes(1);
    await act(async () => resolve(diagnosis));
  });
  it("sin requisitos muestra no evaluable y nunca una cobertura perfecta", async () => {
    vi.mocked(service.diagnoseNeed).mockResolvedValue({ ...diagnosis, evaluation: { ...diagnosis.evaluation, required_skills: [], matched_skills: [], missing_skills: [], coverage: null } });
    render(<PersonalDiagnosis needId="need-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Comparar mi perfil" }));
    await screen.findByText("No evaluable: no se han definido capacidades requeridas.");
    expect(screen.queryByText(/100 %/)).toBeNull();
  });
  it("descarta una comparación pendiente al cambiar de cuenta y no registra su visualización", async () => {
    let resolve!: (value: service.Diagnosis) => void;
    vi.mocked(service.diagnoseNeed).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const view = render(<PersonalDiagnosis needId="need-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Comparar mi perfil" }));
    const oldIdentity = vi.mocked(service.diagnoseNeed).mock.calls[0][2];
    auth.session = { user: { id: "other" }, access_token: "other-token" };
    auth.identityEpoch++;
    view.rerender(<PersonalDiagnosis needId="need-1" />);
    expect(oldIdentity.isCurrent()).toBe(false);
    await act(async () => resolve(diagnosis));
    expect(screen.queryByText(/50 %/)).toBeNull();
    expect(service.markShown).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Comparar mi perfil" })).toBeTruthy();
  });
  it("A→B→A invalida la comparación anterior incluso si React solo renderiza la vuelta a A", async () => {
    let reject!: (failure: Error) => void;
    vi.mocked(service.diagnoseNeed).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const view = render(<PersonalDiagnosis needId="need-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Comparar mi perfil" }));
    const oldIdentity = vi.mocked(service.diagnoseNeed).mock.calls[0][2];
    const oldKey = vi.mocked(service.diagnoseNeed).mock.calls[0][1];
    auth.identityEpoch += 2;
    auth.session = { user: { id: "owner" }, access_token: "returned-A" };
    view.rerender(<PersonalDiagnosis needId="need-1" />);
    await act(async () => reject(new Error("Fallo privado de A anterior")));
    expect(oldIdentity.isCurrent()).toBe(false);
    expect(screen.queryByText("Fallo privado de A anterior")).toBeNull();
    await compare();
    expect(vi.mocked(service.diagnoseNeed).mock.calls[1][1]).not.toBe(oldKey);
  });
  it("elimina evaluación y feedback de A al cambiar de cuenta con un guardado pendiente", async () => {
    let resolve!: () => void;
    vi.mocked(service.saveFeedback).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const view = render(<PersonalDiagnosis needId="need-1" />);
    await compare();
    await waitFor(() => expect(service.markShown).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("¿Te resulta útil?", { exact: false }), { target: { value: "useful" } });
    fireEvent.change(screen.getByLabelText("Comentario opcional"), { target: { value: "Comentario privado de A" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar feedback" }));
    const oldIdentity = vi.mocked(service.saveFeedback).mock.calls[0][3];
    auth.session = { user: { id: "other" }, access_token: "other-token" };
    auth.identityEpoch++;
    view.rerender(<PersonalDiagnosis needId="need-1" />);
    await act(async () => resolve());
    expect(oldIdentity.isCurrent()).toBe(false);
    expect(screen.queryByText(/50 %/)).toBeNull();
    expect(screen.queryByDisplayValue("Comentario privado de A")).toBeNull();
    expect(screen.queryByText("Feedback guardado para esta evaluación.")).toBeNull();
  });
});
function form() {
  return <MemoryRouter initialEntries={["/groups/group-1/needs/new"]}><Routes><Route path="/groups/:groupId/needs/new" element={<NeedFormPage />} /><Route path="/needs/:needId" element={<p>Necesidad creada</p>} /></Routes></MemoryRouter>;
}
describe("Creación de necesidades", () => {
  it("propietario completa creación con capacidades sin sustituir taxonomía", async () => {
    const view = render(form());
    fireEvent.change(await screen.findByLabelText("Título de la necesidad"), { target: { value: "Análisis de datos" } });
    fireEvent.change(screen.getByLabelText("Descripción de la contribución"), { target: { value: "Preparar resultados" } });
    fireEvent.change(screen.getByLabelText("Capacidades requeridas", { exact: false }), { target: { value: "Python, SQL" } });
    auth.session = { user: { id: "owner" }, access_token: "renewed" };
    view.rerender(form());
    expect((screen.getByLabelText("Título de la necesidad") as HTMLInputElement).value).toBe("Análisis de datos");
    fireEvent.click(screen.getByRole("button", { name: "Guardar necesidad" }));
    await screen.findByText("Necesidad creada");
    expect(service.saveNeed).toHaveBeenCalledExactlyOnceWith({ title: "Análisis de datos", description: "Preparar resultados", required_skills: ["Python", "SQL"], status: "open" }, "group-1", null, expect.objectContaining({ userId: "owner" }), undefined);
  });
  it("tercero no accede a formulario ni escribe necesidades", async () => {
    auth.session = { user: { id: "other" }, access_token: "first" };
    render(form());
    await screen.findByText("Solo el propietario o un administrador puede gestionar necesidades.");
    expect(screen.queryByLabelText("Título de la necesidad")).toBeNull();
    expect(service.saveNeed).not.toHaveBeenCalled();
  });
  it("administrador por relación sí puede gestionar necesidades", async () => {
    auth.session = { user: { id: "admin" }, access_token: "first" };
    vi.mocked(api.getOwnMembership).mockResolvedValue({ id: "membership", group_id: "group-1", user_id: "admin", role: "admin", joined_at: "" });
    render(form());
    await screen.findByLabelText("Título de la necesidad");
  });
  it("descarta el borrador y evita navegar por un guardado de la época A anterior", async () => {
    let resolve!: (id: string) => void;
    vi.mocked(service.saveNeed).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const view = render(form());
    fireEvent.change(await screen.findByLabelText("Título de la necesidad"), { target: { value: "Borrador privado de A" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar necesidad" }));
    const oldIdentity = vi.mocked(service.saveNeed).mock.calls[0][3];
    auth.identityEpoch += 2;
    auth.session = { user: { id: "owner" }, access_token: "returned-A" };
    view.rerender(form());
    expect((screen.getByLabelText("Título de la necesidad") as HTMLInputElement).value).toBe("");
    await act(async () => resolve("need-1"));
    expect(oldIdentity.isCurrent()).toBe(false);
    expect(screen.queryByText("Necesidad creada")).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar necesidad" })).toBeTruthy();
  });
});
