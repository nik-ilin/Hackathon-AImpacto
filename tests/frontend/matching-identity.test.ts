import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { diagnoseNeed, markShown, saveFeedback, saveNeed } from "../../src/features/matching/service";
import type { MutationIdentity } from "../../src/lib/supabase/identity";

const client = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), getUser: vi.fn() },
  rpc: vi.fn(),
}));
vi.mock("../../src/lib/supabase/client", () => ({ backend: () => client }));
const makeSession = (userId: string, token = `token-${userId}`) => ({
  user: { id: userId }, access_token: token,
}) as Session;
let current: Session;
let header: ReturnType<typeof vi.fn>;
const diagnosis = {
  id: "event-A", actor_id: "A",
  context: {
    kind: "recruitment", need_id: "need", title: "Need", description: "",
    group_id: "group", group_name: "Group", project_id: null, project_title: null,
    required_skills: [], declared_skills: [], need_updated_at: "2026-10-17T12:00:00Z",
  },
  evaluation: {
    required_skills: [], matched_skills: [], missing_skills: [], additional_skills: [],
    coverage: null, matched_topics: [],
  },
};
const actions: [string, (identity: MutationIdentity) => Promise<unknown>][] = [
  ["save_recruitment_need", identity => saveNeed({ title: "Need", description: "", required_skills: [], status: "open" }, "group", null, identity)],
  ["diagnose_recruitment_need", identity => diagnoseNeed("need", "attempt-A", identity)],
  ["mark_recommendation_shown", identity => markShown("event-A", identity)],
  ["save_recommendation_feedback", identity => saveFeedback("event-A", "useful", "Personal A", identity)],
];
beforeEach(() => {
  vi.resetAllMocks();
  current = makeSession("A");
  client.auth.getSession.mockImplementation(async () => ({ data: { session: current }, error: null }));
  client.auth.getUser.mockResolvedValue({ data: { user: { id: "A" } }, error: null });
  header = vi.fn(async () => ({ data: diagnosis, error: null }));
  client.rpc.mockReturnValue({ setHeader: header });
});

describe.each(actions)("Matching identity: %s", (rpc, action) => {
  it("rechaza la operación de A si la sesión ya es B", async () => {
    current = makeSession("B");
    await expect(action({ userId: "A", isCurrent: () => true })).rejects.toThrow("La cuenta ha cambiado");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("recomprueba la cuenta cuando getUser pendiente acaba tras el cambio a B", async () => {
    let resolve!: (result: { data: { user: { id: string } }; error: null }) => void;
    client.auth.getUser.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = action({ userId: "A", isCurrent: () => true });
    const rejected = expect(pending).rejects.toThrow("La cuenta ha cambiado");
    await vi.waitFor(() => expect(client.auth.getUser).toHaveBeenCalledTimes(1));
    current = makeSession("B");
    resolve({ data: { user: { id: "A" } }, error: null });
    await rejected;
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("rechaza una época A desmontada aunque la cuenta vuelva a A", async () => {
    let active = true;
    client.auth.getUser.mockImplementationOnce(async () => {
      active = false;
      current = makeSession("A", "returned-A");
      return { data: { user: { id: "A" } }, error: null };
    });
    await expect(action({ userId: "A", isCurrent: () => active })).rejects.toThrow("La cuenta ha cambiado");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("acepta el refresh de A y fija Authorization sin adquirir después el token de B", async () => {
    client.auth.getUser.mockImplementationOnce(async () => {
      current = makeSession("A", "refreshed-A");
      return { data: { user: { id: "A" } }, error: null };
    });
    header.mockImplementationOnce(async (name, value) => {
      current = makeSession("B");
      expect(name).toBe("Authorization");
      expect(value).toBe("Bearer refreshed-A");
      return { data: diagnosis, error: null };
    });
    await action({ userId: "A", isCurrent: () => true });
    expect(client.auth.getUser).toHaveBeenCalledWith("token-A");
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith(rpc, expect.any(Object));
    expect(header).toHaveBeenCalledExactlyOnceWith("Authorization", "Bearer refreshed-A");
  });
});
