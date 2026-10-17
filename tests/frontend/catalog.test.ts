import { beforeEach, describe, expect, it, vi } from "vitest";
import { listOpportunities, getOpportunityDetail } from "../../src/lib/supabase/catalog";
const mocks = vi.hoisted(() => ({ from: vi.fn(), session: vi.fn() }));
vi.mock("../../src/lib/supabase/client", () => ({ backend: () => ({ from: mocks.from }) }));
vi.mock("../../src/lib/supabase/identity", () => ({ mutationSession: mocks.session }));
const identity = { userId: "A", isCurrent: () => true };
function query(result: unknown) {
  const chain = { select: vi.fn(), order: vi.fn(), range: vi.fn(), eq: vi.fn(), ilike: vi.fn(), maybeSingle: vi.fn(), setHeader: vi.fn() };
  for (const method of [chain.select, chain.order, chain.range, chain.eq, chain.ilike, chain.maybeSingle]) method.mockReturnValue(chain);
  chain.setHeader.mockResolvedValue(result);
  return chain;
}
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ access_token: "A-token" }); });
describe("contrato de catálogo para frontend", () => {
  it("pagina sin perder el sentinel y fija el JWT de la identidad validada", async () => {
    const chain = query({ data: [{ id: "one" }, { id: "two" }, { id: "next" }], error: null });
    mocks.from.mockReturnValue(chain);
    const page = await listOpportunities({ page: 2, pageSize: 2, type: "research_funding", search: "100%_" }, identity);
    expect(page).toMatchObject({ items: [{ id: "one" }, { id: "two" }], hasMore: true, page: 2, pageSize: 2 });
    expect(chain.range).toHaveBeenCalledWith(4, 6);
    expect(chain.setHeader).toHaveBeenCalledWith("Authorization", "Bearer A-token");
    expect(chain.ilike).toHaveBeenCalledWith("title", "%100\\%\\_%");
  });
  it("rechaza filtros inválidos antes de consultar y descarta datos si la cuenta deja de estar vigente", async () => {
    await expect(listOpportunities({ pageSize: 500 }, identity)).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
    const chain = query({ data: [{ id: "private-A" }], error: null });
    mocks.from.mockReturnValue(chain);
    await expect(listOpportunities({}, { userId: "A", isCurrent: () => false })).rejects.toThrow("La cuenta ha cambiado");
  });
  it("detalle oculto devuelve null sin consultar tablas de detalles", async () => {
    mocks.from.mockReturnValue(query({ data: null, error: null }));
    await expect(getOpportunityDetail("20000000-0000-4000-8000-000000000001", identity)).resolves.toBeNull();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});
