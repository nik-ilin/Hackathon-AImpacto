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
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { AuthProvider } from "../../src/app/providers/AuthProvider";
import { ProtectedRoute } from "../../src/app/routes";
import { AuthContext } from "../../src/app/providers/auth-context";
import { ProjectFormPage } from "../../src/features/projects/ProjectPages";
import {
  GroupDetailPage,
  GroupFormPage,
} from "../../src/features/groups/GroupPages";
import {
  ExplorePage,
  DashboardPage,
} from "../../src/features/discovery/DiscoveryPages";
import { ProfilePage } from "../../src/features/profiles/ProfilePage";
import { RequiredProfile } from "../../src/features/profiles/RequiredProfile";
import * as api from "../../src/lib/supabase/api";
import type { Tables } from "../../src/types/database";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  listeners: new Set<
    (event: AuthChangeEvent, session: Session | null) => void
  >(),
}));
vi.mock("../../src/lib/supabase/client", () => ({
  configurationError: null,
  supabase: {
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: (
        listener: (event: AuthChangeEvent, session: Session | null) => void,
      ) => {
        auth.listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => auth.listeners.delete(listener),
            },
          },
        };
      },
    },
  },
}));

vi.mock("../../src/lib/supabase/api", () => ({
  getTopics: vi.fn(),
  getGroup: vi.fn(),
  getOwnMembership: vi.fn(),
  getProject: vi.fn(),
  getProjectTopics: vi.fn(),
  saveProject: vi.fn(),
  getGroupTopics: vi.fn(),
  saveGroup: vi.fn(),
  getProfile: vi.fn(),
  getProfileTopics: vi.fn(),
  saveProfile: vi.fn(),
  discoverGroups: vi.fn(),
  getMyGroups: vi.fn(),
  getGroupMembers: vi.fn(),
  getGroupProjects: vi.fn(),
  getGroupRequest: vi.fn(),
  getVisibleProfiles: vi.fn(),
  requestToJoin: vi.fn(),
}));

const group: Tables<"research_groups"> = {
  id: "group",
  owner_id: "A",
  name: "Grupo científico",
  description: "Descripción científica suficientemente extensa.",
  institution: "",
  country: "",
  visibility: "public",
  accepting_members: true,
  created_at: "",
  updated_at: "",
};
const profile: Tables<"profiles"> = {
  id: "A",
  full_name: "Persona A",
  username: null,
  institution: "",
  country: "",
  academic_stage: null,
  bio: "",
  skills: [],
  orcid_id: null,
  visibility: "private",
  created_at: "",
  updated_at: "",
};
const topic = { id: "topic", name: "Física", slug: "fisica", parent_id: null };
const project: Tables<"research_projects"> = {
  id: "project",
  group_id: "group",
  title: "Proyecto persistido",
  description: "Una descripción persistida suficientemente extensa.",
  status: "draft",
  visibility: "public",
  funding_needed_amount: 500,
  funding_currency: "EUR",
  created_at: "",
  updated_at: "",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function session(user = "A", token = "initial") {
  return { user: { id: user }, access_token: token } as Session;
}
function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <button onClick={() => void navigate(-1)}>Atrás</button>
      <button onClick={() => void navigate(1)}>Adelante</button>
      <button onClick={() => void navigate("/explore?q=url")}>
        Cambiar URL
      </button>
      <span data-testid="location">{location.pathname + location.search}</span>
      <span data-testid="return">
        {(location.state as { from?: string } | null)?.from}
      </span>
    </>
  );
}
function Harness({
  current = session(),
  path,
}: {
  current?: Session;
  path: string;
}) {
  return (
    <AuthContext.Provider
      value={{
        session: current,
        identityEpoch: 0,
        loading: false,
        error: null,
        recovery: false,
        finishRecovery: vi.fn(),
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <Navigation />
        <Routes>
          <Route
            path="/groups/new"
            element={
              <RequiredProfile>
                <GroupFormPage />
              </RequiredProfile>
            }
          />
          <Route path="/groups/:groupId" element={<GroupDetailPage />} />
          <Route path="/groups/:groupId/edit" element={<GroupFormPage />} />
          <Route
            path="/groups/:groupId/projects/new"
            element={<ProjectFormPage />}
          />
          <Route
            path="/projects/:projectId/edit"
            element={<ProjectFormPage />}
          />
          <Route
            path="/projects/:projectId"
            element={<p>Proyecto guardado</p>}
          />
          <Route path="/onboarding" element={<ProfilePage onboarding />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}
const input = (name: string) =>
  screen.getByRole("textbox", { name }) as HTMLInputElement;
const change = (name: string, value: string) =>
  fireEvent.change(input(name), { target: { value } });

beforeEach(() => {
  vi.resetAllMocks();
  auth.listeners.clear();
  auth.getSession.mockResolvedValue({
    data: { session: session() },
    error: null,
  });
  vi.mocked(api.getTopics).mockResolvedValue([topic]);
  vi.mocked(api.getGroup).mockResolvedValue(group);
  vi.mocked(api.getOwnMembership).mockResolvedValue(null);
  vi.mocked(api.getProject).mockResolvedValue(project);
  vi.mocked(api.getProjectTopics).mockResolvedValue([]);
  vi.mocked(api.getGroupTopics).mockResolvedValue([]);
  vi.mocked(api.getProfile).mockResolvedValue(profile);
  vi.mocked(api.getProfileTopics).mockResolvedValue([]);
  vi.mocked(api.getMyGroups).mockResolvedValue({
    owned: [],
    joined: [],
    memberships: [],
    ownedTotal: 0,
    joinedTotal: 0,
  });
  vi.mocked(api.discoverGroups).mockResolvedValue([]);
  vi.mocked(api.getGroupMembers).mockResolvedValue([]);
  vi.mocked(api.getGroupProjects).mockResolvedValue([]);
  vi.mocked(api.getGroupRequest).mockResolvedValue(null);
  vi.mocked(api.getVisibleProfiles).mockResolvedValue([]);
  vi.mocked(api.saveProject).mockResolvedValue("project");
  vi.mocked(api.saveGroup).mockResolvedValue("group");
});
afterEach(cleanup);

describe("Edición ligada a identidad", () => {
  it("eventos AuthProvider reales distinguen TOKEN_REFRESHED de A→B→A en un mismo batch", async () => {
    const old = deferred<string>();
    vi.mocked(api.saveProject).mockReturnValueOnce(old.promise);
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/groups/group/projects/new"]}>
          <Navigation />
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route
                path="/groups/:groupId/projects/new"
                element={<ProjectFormPage />}
              />
              <Route
                path="/projects/:projectId"
                element={<p>Guardado viejo</p>}
              />
            </Route>
            <Route path="/login" element={<p>Iniciar sesión</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    await screen.findByRole("textbox", { name: "Título del proyecto" });
    change("Título del proyecto", "Edición original");
    change("Descripción", "Descripción pendiente de la cuenta original.");
    const title = input("Título del proyecto");
    act(() => {
      auth.listeners.forEach((listener) =>
        listener("TOKEN_REFRESHED", session("A", "refreshed")),
      );
    });
    expect(input("Título del proyecto")).toBe(title);
    expect(title.value).toBe("Edición original");
    expect(api.getGroup).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    await waitFor(() => expect(api.saveProject).toHaveBeenCalledTimes(1));
    const oldIdentity = vi.mocked(api.saveProject).mock.calls[0]![3];
    act(() => {
      auth.listeners.forEach((listener) => listener("SIGNED_IN", session("B")));
      auth.listeners.forEach((listener) => listener("SIGNED_IN", session("A")));
    });
    await screen.findByRole("textbox", { name: "Título del proyecto" });
    expect(input("Título del proyecto").value).toBe("");
    expect(oldIdentity.isCurrent()).toBe(false);
    await act(async () => {
      old.resolve("old");
    });
    expect(screen.queryByText("Guardado viejo")).toBeNull();
    act(() => {
      auth.listeners.forEach((listener) => listener("SIGNED_OUT", null));
    });
    await screen.findByText("Iniciar sesión");
    expect(
      screen.queryByRole("textbox", { name: "Título del proyecto" }),
    ).toBeNull();
  });
  it("TOKEN_REFRESHED conserva título, descripción, financiación y temas sin recargar", async () => {
    const path = "/groups/group/projects/new";
    const view = render(<Harness path={path} />);
    await screen.findByRole("textbox", { name: "Título del proyecto" });
    change("Título del proyecto", "Título pendiente");
    change("Descripción", "Descripción pendiente que no se debe perder.");
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "1250.50" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Moneda/ }), {
      target: { value: "USD" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Física" }));
    const title = input("Título del proyecto");
    view.rerender(<Harness path={path} current={session("A", "refreshed")} />);
    await act(async () => {});
    expect(input("Título del proyecto")).toBe(title);
    expect(title.value).toBe("Título pendiente");
    expect(input("Descripción").value).toContain("pendiente");
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe(
      "1250.50",
    );
    expect(
      (screen.getByRole("textbox", { name: /Moneda/ }) as HTMLInputElement)
        .value,
    ).toBe("USD");
    expect(
      (screen.getByRole("checkbox", { name: "Física" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(api.getGroup).toHaveBeenCalledTimes(1);
  });
  it("cambiar A por B descarta el editor y una carga antigua no recupera el borrador", async () => {
    const path = "/groups/group/projects/new";
    const old = deferred<Tables<"research_groups">>();
    vi.mocked(api.getGroup)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ ...group, owner_id: "B" });
    const view = render(<Harness path={path} />);
    await waitFor(() => expect(api.getGroup).toHaveBeenCalledTimes(1));
    view.rerender(<Harness path={path} current={session("B")} />);
    await screen.findByRole("textbox", { name: "Título del proyecto" });
    change("Título del proyecto", "Borrador B");
    await act(async () => {
      old.resolve(group);
    });
    expect(input("Título del proyecto").value).toBe("Borrador B");
  });
  it("una respuesta de guardado A no navega ni restaura datos después de A→B→A", async () => {
    const path = "/groups/group/projects/new";
    const old = deferred<string>();
    vi.mocked(api.saveProject).mockReturnValueOnce(old.promise);
    const view = render(<Harness path={path} />);
    await screen.findByRole("textbox", { name: "Título del proyecto" });
    change("Título del proyecto", "Proyecto de A");
    change("Descripción", "Descripción válida de la cuenta A.");
    fireEvent.click(screen.getByRole("button", { name: "Crear proyecto" }));
    await waitFor(() => expect(api.saveProject).toHaveBeenCalledTimes(1));
    const identity = vi.mocked(api.saveProject).mock.calls[0]![3];
    view.rerender(<Harness path={path} current={session("B")} />);
    view.rerender(<Harness path={path} current={session("A")} />);
    await screen.findByRole("textbox", { name: "Título del proyecto" });
    expect(identity.isCurrent()).toBe(false);
    await act(async () => {
      old.resolve("old-project");
    });
    expect(screen.getByTestId("location").textContent).toBe(path);
    expect(input("Título del proyecto").value).toBe("");
  });
  it("el borrador de grupo sobrevive refresh pero no al cambio de cuenta y el guardado viejo no navega", async () => {
    const path = "/groups/new";
    const old = deferred<string>();
    vi.mocked(api.saveGroup).mockReturnValueOnce(old.promise);
    const view = render(<Harness path={path} />);
    await screen.findByRole("textbox", { name: "Nombre del grupo" });
    change("Nombre del grupo", "Grupo de A");
    change("Descripción", "Descripción suficientemente extensa de A.");
    view.rerender(<Harness path={path} current={session("A", "refresh")} />);
    expect(input("Nombre del grupo").value).toBe("Grupo de A");
    fireEvent.click(screen.getByRole("button", { name: "Crear grupo" }));
    await waitFor(() => expect(api.saveGroup).toHaveBeenCalledTimes(1));
    const identity = vi.mocked(api.saveGroup).mock.calls[0]![2];
    view.rerender(<Harness path={path} current={session("B")} />);
    await screen.findByRole("textbox", { name: "Nombre del grupo" });
    expect(input("Nombre del grupo").value).toBe("");
    expect(identity.userId).toBe("A");
    expect(identity.isCurrent()).toBe(false);
    await act(async () => {
      old.resolve("old-group");
    });
    expect(screen.getByTestId("location").textContent).toBe(path);
  });
  it("representa public persistido en grupo privado y permite guardar private explícitamente", async () => {
    vi.mocked(api.getGroup).mockResolvedValue({
      ...group,
      visibility: "private",
    });
    render(<Harness path="/projects/project/edit" />);
    await screen.findByRole("textbox", { name: "Título del proyecto" });
    const visibility = screen.getByRole("combobox", {
      name: "Visibilidad",
    }) as HTMLSelectElement;
    expect(visibility.value).toBe("public");
    expect(screen.getByText(/El grupo es privado/).textContent).toContain(
      "no puede descubrirse",
    );
    expect(api.saveProject).not.toHaveBeenCalled();
    fireEvent.change(visibility, { target: { value: "private" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar proyecto" }));
    await waitFor(() => expect(api.saveProject).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.saveProject).mock.calls[0]![0].visibility).toBe(
      "private",
    );
  });
  it("guardar otro campo de un proyecto public en grupo privado conserva public sin coerción", async () => {
    vi.mocked(api.getGroup).mockResolvedValue({
      ...group,
      visibility: "private",
    });
    render(<Harness path="/projects/project/edit" />);
    await screen.findByRole("textbox", { name: "Título del proyecto" });
    change("Título del proyecto", "Título cambiado explícitamente");
    fireEvent.click(screen.getByRole("button", { name: "Guardar proyecto" }));
    await waitFor(() => expect(api.saveProject).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.saveProject).mock.calls[0]![0].visibility).toBe(
      "public",
    );
  });
  it("al cambiar de cuenta descarta presentación y la respuesta vieja de incorporación", async () => {
    const pending = deferred<void>();
    vi.mocked(api.requestToJoin).mockReturnValueOnce(pending.promise);
    const path = "/groups/group";
    const view = render(<Harness path={path} current={session("visitor-A")} />);
    await screen.findByRole("textbox", { name: "Presentación (opcional)" });
    change("Presentación (opcional)", "Presentación de A");
    fireEvent.click(
      screen.getByRole("button", { name: "Solicitar incorporación" }),
    );
    await waitFor(() => expect(api.requestToJoin).toHaveBeenCalledTimes(1));
    view.rerender(<Harness path={path} current={session("visitor-B")} />);
    await screen.findByRole("textbox", { name: "Presentación (opcional)" });
    expect(input("Presentación (opcional)").value).toBe("");
    await act(async () => {
      pending.resolve();
    });
    expect(screen.queryByText(/Tu solicitud está pendiente/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Solicitar incorporación" }),
    ).toBeTruthy();
  });
});

describe("Perfil obligatorio", () => {
  it("no muestra creación durante loading; error permite retry y ausencia redirige con retorno sin bucle", async () => {
    const pending = deferred<Tables<"profiles"> | null>();
    vi.mocked(api.getProfile)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(null);
    render(<Harness path="/groups/new?origin=explore" />);
    expect(
      screen.queryByRole("textbox", { name: "Nombre del grupo" }),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Cargando");
    // A genuine failure must remain an error, never masquerade as a missing profile.
    vi.mocked(api.getProfile).mockRejectedValueOnce(
      new Error("Perfil no disponible"),
    );
    await act(async () => {
      pending.resolve(null);
    });
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/onboarding"),
    );
    expect(screen.getByTestId("return").textContent).toBe(
      "/groups/new?origin=explore",
    );
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Volver a intentar" }));
    await screen.findByRole("textbox", { name: "Nombre completo" });
    change("Nombre completo", "Persona nueva");
    vi.mocked(api.getProfile).mockResolvedValue(profile);
    fireEvent.click(screen.getByRole("button", { name: "Guardar y comenzar" }));
    await screen.findByRole("textbox", { name: "Nombre del grupo" });
    expect(screen.getByTestId("location").textContent).toBe(
      "/groups/new?origin=explore",
    );
  });
  it("un error comprobando perfil bloquea la creación y permite reintentar", async () => {
    vi.mocked(api.getProfile).mockRejectedValueOnce(new Error("Red caída"));
    render(<Harness path="/groups/new" />);
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("textbox", { name: "Nombre del grupo" }),
    ).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/groups/new");
    fireEvent.click(screen.getByRole("button", { name: "Volver a intentar" }));
    await screen.findByRole("textbox", { name: "Nombre del grupo" });
  });
  it("un visitante sin perfil no ve ni puede enviar una incorporación", async () => {
    vi.mocked(api.getProfile).mockResolvedValue(null);
    render(<Harness path="/groups/group" current={session("visitor")} />);
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/onboarding"),
    );
    expect(screen.getByTestId("return").textContent).toBe("/groups/group");
    expect(
      screen.queryByRole("button", { name: "Solicitar incorporación" }),
    ).toBeNull();
    expect(api.requestToJoin).not.toHaveBeenCalled();
  });
});

describe("Exploración y recomendaciones", () => {
  it("sincroniza q al navegar Atrás/Adelante o URL; otros filtros conservan edición pendiente", async () => {
    render(<Harness path="/explore?q=inicial" />);
    const search = input("Buscar un grupo");
    fireEvent.change(search, { target: { value: "enviado" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/explore?q=enviado",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    await waitFor(() => expect(search.value).toBe("inicial"));
    fireEvent.click(screen.getByRole("button", { name: "Adelante" }));
    await waitFor(() => expect(search.value).toBe("enviado"));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar URL" }));
    await waitFor(() => expect(search.value).toBe("url"));
    fireEvent.change(search, { target: { value: "borrador sin enviar" } });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Aceptan incorporaciones" }),
    );
    expect(search.value).toBe("borrador sin enviar");
    await waitFor(() =>
      expect(api.discoverGroups).toHaveBeenLastCalledWith(
        "A",
        "url",
        null,
        true,
        0,
        13,
      ),
    );
  });
  for (const path of ["/explore", "/dashboard"]) {
    it(`${path} invalida resultados y explicaciones A→B, descarta respuestas viejas y no recarga TOKEN_REFRESHED`, async () => {
      const lateA = deferred<Awaited<ReturnType<typeof api.discoverGroups>>>();
      const pendingB =
        deferred<Awaited<ReturnType<typeof api.discoverGroups>>>();
      vi.mocked(api.discoverGroups)
        .mockResolvedValueOnce([
          { ...group, match_count: 1, matched_topics: ["Interés A"] },
        ])
        .mockReturnValueOnce(lateA.promise)
        .mockReturnValueOnce(pendingB.promise);
      const view = render(<Harness path={path} />);
      await screen.findByText("Coincide con tus intereses: Interés A.");
      view.rerender(<Harness path={path} current={session("A", "refresh")} />);
      await act(async () => {});
      expect(api.discoverGroups).toHaveBeenCalledTimes(1);
      view.rerender(<Harness path={path} current={session("C")} />);
      await waitFor(() => expect(api.discoverGroups).toHaveBeenCalledTimes(2));
      view.rerender(<Harness path={path} current={session("B")} />);
      expect(screen.queryByText(/Interés A/)).toBeNull();
      await waitFor(() => expect(api.discoverGroups).toHaveBeenCalledTimes(3));
      await act(async () => {
        pendingB.resolve([
          {
            ...group,
            name: "Grupo B",
            match_count: 1,
            matched_topics: ["Interés B"],
          },
        ]);
      });
      await screen.findByText("Coincide con tus intereses: Interés B.");
      await act(async () => {
        lateA.resolve([
          { ...group, match_count: 1, matched_topics: ["Interés antiguo"] },
        ]);
      });
      expect(screen.queryByText(/Interés antiguo/)).toBeNull();
      expect(
        screen.getByText("Coincide con tus intereses: Interés B."),
      ).toBeTruthy();
    });
  }
});
