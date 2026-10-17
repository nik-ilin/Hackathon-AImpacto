import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  discoverGroups,
  requestToJoin,
  saveGroup,
  saveProject,
} from "../../src/lib/supabase/api";

const client = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), getUser: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../../src/lib/supabase/client", () => ({ backend: () => client }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const identity = () => ({ userId: "A", isCurrent: vi.fn(() => true) });
const session = (userId: string) =>
  ({ user: { id: userId }, access_token: `token-${userId}` }) as Session;
const values = {
  name: "Grupo",
  description: "Descripción suficientemente extensa.",
  institution: "",
  country: "",
  visibility: "public",
  accepting_members: true,
} as const;
const projectValues = {
  title: "Proyecto",
  description: values.description,
  status: "draft",
  visibility: "private",
  funding_needed_amount: "",
  funding_currency: "",
} as const;
let current: Session;
let profileResponse: { data: { id: string } | null; error: Error | null };
let rpcHeader: ReturnType<typeof vi.fn>;
let profileHeader: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  current = session("A");
  profileResponse = { data: { id: "A" }, error: null };
  client.auth.getSession.mockImplementation(async () => ({
    data: { session: current },
    error: null,
  }));
  client.auth.getUser.mockResolvedValue({
    data: { user: { id: "A" } },
    error: null,
  });
  profileHeader = vi.fn(async () => profileResponse);
  client.from.mockReturnValue({
    select: () => ({
      eq: () => ({ maybeSingle: () => ({ setHeader: profileHeader }) }),
    }),
  });
  rpcHeader = vi.fn(async () => ({ data: "saved", error: null }));
  client.rpc.mockReturnValue({ setHeader: rpcHeader });
});

describe("Identidad de mutaciones y RPC personalizadas", () => {
  it("rechaza guardar un borrador A si la sesión ya es B", async () => {
    current = session("B");
    await expect(saveGroup(values, [], identity())).rejects.toThrow(
      "La cuenta ha cambiado",
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("recomprueba después de validar usuario: cambiar cuenta durante el await evita RPC", async () => {
    const validation = deferred<{
      data: { user: { id: string } };
      error: null;
    }>();
    client.auth.getUser.mockReturnValueOnce(validation.promise);
    const saving = saveProject(projectValues, [], "group", identity());
    await vi.waitFor(() =>
      expect(client.auth.getUser).toHaveBeenCalledTimes(1),
    );
    current = session("B");
    validation.resolve({ data: { user: { id: "A" } }, error: null });
    await expect(saving).rejects.toThrow("La cuenta ha cambiado");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("un editor desmontado durante comprobaciones no puede ejecutar la mutación", async () => {
    const editor = identity();
    client.auth.getUser.mockImplementationOnce(async () => {
      editor.isCurrent.mockReturnValue(false);
      return { data: { user: { id: "A" } }, error: null };
    });
    await expect(
      saveProject(projectValues, [], "group", editor),
    ).rejects.toThrow("La cuenta ha cambiado");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("una comprobación de perfil pendiente se revalida contra la cuenta al completarse", async () => {
    const pending = deferred<typeof profileResponse>();
    profileHeader.mockReturnValueOnce(pending.promise);
    const saving = saveGroup(values, [], identity());
    await vi.waitFor(() => expect(profileHeader).toHaveBeenCalledTimes(1));
    current = session("B");
    pending.resolve({ data: { id: "A" }, error: null });
    await expect(saving).rejects.toThrow("La cuenta ha cambiado");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  for (const action of [
    () => saveGroup(values, [], identity()),
    () => requestToJoin("group", "", identity()),
  ]) {
    it("perfil ausente impide la mutación importante aunque la ruta se hubiese comprobado antes", async () => {
      profileResponse.data = null;
      await expect(action()).rejects.toThrow("Completa tu perfil");
      expect(client.rpc).not.toHaveBeenCalled();
    });
    it("error consultando el perfil impide la mutación sin ocultar el error", async () => {
      profileResponse.error = new Error("Perfil inaccesible");
      await expect(action()).rejects.toThrow("Perfil inaccesible");
      expect(client.rpc).not.toHaveBeenCalled();
    });
  }
  it("fija Authorization a A incluso si fetch adquiere la sesión B antes de enviar", async () => {
    rpcHeader.mockImplementationOnce(async (name, token) => {
      current = session("B");
      expect(name).toBe("Authorization");
      expect(token).toBe("Bearer token-A");
      return { data: "saved", error: null };
    });
    await expect(saveGroup(values, [], identity())).resolves.toBe("saved");
    expect(profileHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer token-A",
    );
    expect(rpcHeader).toHaveBeenCalledWith("Authorization", "Bearer token-A");
  });
  it("recomendaciones capturan el token del usuario solicitado, nunca el de otra cuenta", async () => {
    await discoverGroups("A", "física");
    expect(rpcHeader).toHaveBeenCalledWith("Authorization", "Bearer token-A");
    client.rpc.mockClear();
    current = session("B");
    await expect(discoverGroups("A")).rejects.toThrow("La cuenta ha cambiado");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
