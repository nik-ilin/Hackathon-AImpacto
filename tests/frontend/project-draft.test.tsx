// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AuthContext } from "../../src/app/providers/auth-context";
import { ProjectFormPage } from "../../src/features/projects/ProjectPages";
import {
  getGroup,
  getOwnMembership,
  getProject,
  getProjectTopics,
  getTopics,
} from "../../src/lib/supabase/api";

vi.mock("../../src/lib/supabase/api", () => ({
  getGroup: vi.fn(),
  getOwnMembership: vi.fn(),
  getProject: vi.fn(),
  getProjectTopics: vi.fn(),
  getTopics: vi.fn(),
  saveProject: vi.fn(),
}));

function session(userId = "owner", token = "initial"): Session {
  return {
    access_token: token,
    refresh_token: token,
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id: userId,
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "",
    },
  };
}

function form(authSession: Session, editing: boolean) {
  return (
    <AuthContext.Provider
      value={{
        session: authSession,
        identityEpoch: 0,
        loading: false,
        error: null,
        recovery: false,
        finishRecovery: () => {},
      }}
    >
      <MemoryRouter
        initialEntries={[
          editing ? "/projects/project/edit" : "/groups/group/projects/new",
        ]}
      >
        <Routes>
          <Route
            path="/projects/:projectId/edit"
            element={<ProjectFormPage />}
          />
          <Route
            path="/groups/:groupId/projects/new"
            element={<ProjectFormPage />}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGroup).mockResolvedValue({
    id: "group",
    owner_id: "owner",
    name: "Grupo",
    description: "",
    institution: "",
    country: "",
    visibility: "public",
    accepting_members: true,
    created_at: "",
    updated_at: "",
  });
  vi.mocked(getOwnMembership).mockResolvedValue(null);
  vi.mocked(getTopics).mockResolvedValue([
    { id: "physics", name: "Física", slug: "fisica", parent_id: null },
  ]);
  vi.mocked(getProjectTopics).mockResolvedValue([]);
  vi.mocked(getProject).mockResolvedValue({
    id: "project",
    group_id: "group",
    title: "Título guardado",
    description: "Descripción original del proyecto",
    status: "draft",
    visibility: "private",
    funding_needed_amount: null,
    funding_currency: null,
    created_at: "",
    updated_at: "",
  });
});
afterEach(cleanup);

describe("Borrador del editor de proyectos", () => {
  it.each([false, true])(
    "conserva campos y temática al renovar la sesión (edición: %s)",
    async (editing) => {
      const view = render(form(session(), editing));
      const title = await screen.findByLabelText("Título del proyecto");
      fireEvent.change(title, { target: { value: "Borrador sin guardar" } });
      fireEvent.change(screen.getByLabelText("Descripción"), {
        target: { value: "Una descripción nueva todavía sin guardar" },
      });
      fireEvent.change(screen.getByLabelText("Estado"), {
        target: { value: "active" },
      });
      fireEvent.click(screen.getByRole("checkbox", { name: "Física" }));
      await act(async () =>
        view.rerender(form(session("owner", "renewed"), editing)),
      );
      expect(screen.getByLabelText("Título del proyecto")).toBe(title);
      expect((title as HTMLInputElement).value).toBe("Borrador sin guardar");
      expect(
        (screen.getByLabelText("Descripción") as HTMLTextAreaElement).value,
      ).toBe("Una descripción nueva todavía sin guardar");
      expect((screen.getByLabelText("Estado") as HTMLSelectElement).value).toBe(
        "active",
      );
      expect(
        (screen.getByRole("checkbox", { name: "Física" }) as HTMLInputElement)
          .checked,
      ).toBe(true);
      expect(getGroup).toHaveBeenCalledTimes(1);
      expect(getOwnMembership).toHaveBeenCalledTimes(1);
    },
  );

  it("vuelve a comprobar los permisos cuando cambia la identidad", async () => {
    const view = render(form(session(), false));
    await screen.findByLabelText("Título del proyecto");
    await act(async () => view.rerender(form(session("other"), false)));
    await waitFor(() =>
      expect(getOwnMembership).toHaveBeenLastCalledWith("group", "other"),
    );
    expect(
      await screen.findByText(/Solo el propietario o un administrador/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Título del proyecto")).toBeNull();
  });
});
