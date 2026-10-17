// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AuthContext } from "../../src/app/providers/auth-context";
import { ProfilePage } from "../../src/features/profiles/ProfilePage";
import * as api from "../../src/lib/supabase/api";
import { fetchOrcidImport } from "../../src/features/profiles/import/orcid-client";
import type { Tables } from "../../src/types/database";

vi.mock("../../src/features/profiles/import/orcid-client", () => ({ fetchOrcidImport: vi.fn() }));
vi.mock("../../src/features/profiles/import/linkedin", () => ({ parseLinkedInExport: vi.fn() }));
vi.mock("../../src/lib/supabase/api", () => ({
  getProfile: vi.fn(), getProfileTopics: vi.fn(), getTopics: vi.fn(), saveProfile: vi.fn(),
}));

const profile: Tables<"profiles"> = {
  id: "A", full_name: "Nombre manual", username: null, institution: "Institución manual",
  country: "", academic_stage: null, bio: "Biografía manual", skills: [],
  orcid_id: null, visibility: "private", created_at: "", updated_at: "",
};
const topic: Tables<"topics"> = { id: "physics", name: "Física", slug: "fisica", parent_id: null };
function session(id: string, token = "token") {
  return { user: { id }, access_token: token } as Session;
}
function Harness({ current = session("A"), epoch = 0 }: { current?: Session; epoch?: number }) {
  return (
    <AuthContext.Provider value={{ session: current, identityEpoch: epoch, loading: false, error: null, recovery: false, finishRecovery: vi.fn() }}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<ProfilePage key={epoch} />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}
function proposed(name = "Nombre ORCID") {
  return { source: "ORCID" as const, fields: { full_name: name, institution: "Institución ORCID", orcid_id: "0000-0002-1825-0097" }, context: ["Publicación visible"], topicHints: ["Física"] };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getProfile).mockResolvedValue(profile);
  vi.mocked(api.getProfileTopics).mockResolvedValue([]);
  vi.mocked(api.getTopics).mockResolvedValue([topic]);
  vi.mocked(api.saveProfile).mockResolvedValue(undefined);
  vi.mocked(fetchOrcidImport).mockResolvedValue(proposed());
});
afterEach(cleanup);

describe("Importación del perfil", () => {
  it("conserva valores manuales y no guarda hasta seleccionar, aplicar y confirmar", async () => {
    render(<Harness />);
    await screen.findByRole("textbox", { name: "Nombre completo" });
    fireEvent.change(screen.getByRole("textbox", { name: "ORCID iD o URL" }), { target: { value: "0000-0002-1825-0097" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar ORCID" }));
    await screen.findByRole("heading", { name: "Vista previa de ORCID" });
    expect((screen.getByRole("textbox", { name: "Nombre completo" }) as HTMLInputElement).value).toBe("Nombre manual");
    expect(api.saveProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Aplicar selección al formulario" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Nombre completo (ORCID)" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Valor propuesto: Nombre completo" }), { target: { value: "Nombre revisado" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar selección al formulario" }));
    expect((screen.getByRole("textbox", { name: "Nombre completo" }) as HTMLInputElement).value).toBe("Nombre revisado");
    expect((screen.getByRole("textbox", { name: "Institución" }) as HTMLInputElement).value).toBe("Institución manual");
    expect(api.saveProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
    await waitFor(() => expect(api.saveProfile).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(api.saveProfile).mock.calls[0]![0];
    expect(saved.full_name).toBe("Nombre revisado");
    expect(saved.institution).toBe("Institución manual");
    expect(saved.visibility).toBe("private");
  });

  it("conserva vista previa tras refresh y descarta respuesta obsoleta A→B→A", async () => {
    const late = deferred<ReturnType<typeof proposed>>();
    vi.mocked(fetchOrcidImport).mockReturnValueOnce(late.promise).mockResolvedValueOnce(proposed("Nuevo"));
    const view = render(<Harness />);
    await screen.findByRole("textbox", { name: "Nombre completo" });
    fireEvent.click(screen.getByRole("button", { name: "Consultar ORCID" }));
    view.rerender(<Harness current={session("A", "refreshed")} />);
    expect(fetchOrcidImport).toHaveBeenCalledTimes(1);
    view.rerender(<Harness current={session("B")} epoch={1} />);
    await screen.findByRole("textbox", { name: "Nombre completo" });
    view.rerender(<Harness current={session("A")} epoch={2} />);
    await screen.findByRole("textbox", { name: "Nombre completo" });
    await act(async () => { late.resolve(proposed("Dato antiguo")); });
    expect(screen.queryByRole("heading", { name: "Vista previa de ORCID" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Consultar ORCID" }));
    await screen.findByRole("heading", { name: "Vista previa de ORCID" });
    expect((screen.getByRole("textbox", { name: "Valor propuesto: Nombre completo" }) as HTMLInputElement).value).toBe("Nuevo");
    view.rerender(<Harness current={session("A", "new-token")} epoch={2} />);
    expect((screen.getByRole("textbox", { name: "Valor propuesto: Nombre completo" }) as HTMLInputElement).value).toBe("Nuevo");
  });
});
