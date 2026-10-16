// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  GroupCard,
  Notice,
  Pagination,
  TopicPicker,
} from "../../src/components/ui";
import { useResource } from "../../src/hooks/useResource";
import type { Tables } from "../../src/types/database";

afterEach(cleanup);
describe("Componentes accesibles", () => {
  it("distingue los errores de los mensajes de éxito", () => {
    const view = render(<Notice>Error de persistencia</Notice>);
    expect(screen.getByRole("alert").textContent).toContain(
      "Error de persistencia",
    );
    view.rerender(<Notice success>Guardado confirmado</Notice>);
    expect(screen.getByRole("status").textContent).toContain(
      "Guardado confirmado",
    );
  });
  it("selecciona y deselecciona tópicos con controles etiquetados", () => {
    const onChange = vi.fn();
    const topics = [
      { id: "physics", name: "Física", slug: "fisica", parent_id: null },
    ];
    const view = render(
      <TopicPicker topics={topics} selected={[]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Física" }));
    expect(onChange).toHaveBeenLastCalledWith(["physics"]);
    view.rerender(
      <TopicPicker
        topics={topics}
        selected={["physics"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Física" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
  it("muestra la explicación recibida del matching SQL y enlaza al grupo", () => {
    const group: Tables<"research_groups"> = {
      id: "group-id",
      owner_id: "owner",
      name: "Física aplicada",
      description: "Investigación interdisciplinar de materiales.",
      institution: "Universidad",
      country: "España",
      visibility: "public",
      accepting_members: true,
      created_at: "",
      updated_at: "",
    };
    render(
      <MemoryRouter>
        <GroupCard group={group} matchedTopics={["Física", "Materiales"]} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("Coincide con tus intereses: Física, Materiales."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Física aplicada" })
        .getAttribute("href"),
    ).toBe("/groups/group-id");
  });
  it("desactiva avanzar cuando no hay más datos y volver en la primera página", () => {
    const onPage = vi.fn();
    const view = render(<Pagination page={0} hasMore onPage={onPage} />);
    expect(
      (screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(onPage).toHaveBeenCalledWith(1);
    view.rerender(<Pagination page={1} hasMore={false} onPage={onPage} />);
    expect(
      (screen.getByRole("button", { name: "Siguiente" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
describe("Ciclo de carga independiente del backend", () => {
  it("impide que una respuesta antigua sustituya a un recurso nuevo", async () => {
    let resolveOld!: (value: string) => void;
    const oldLoader = () =>
      new Promise<string>((resolve) => {
        resolveOld = resolve;
      });
    const newLoader = () => Promise.resolve("nuevo");
    const view = renderHook(({ loader }) => useResource(loader), {
      initialProps: { loader: oldLoader },
    });
    expect(view.result.current.loading).toBe(true);
    view.rerender({ loader: newLoader });
    await waitFor(() => expect(view.result.current.data).toBe("nuevo"));
    await act(async () => {
      resolveOld("antiguo");
    });
    expect(view.result.current.data).toBe("nuevo");
  });
  it("expone errores reales y permite volver a cargar", async () => {
    let fail = true;
    const loader = () =>
      fail
        ? Promise.reject(new Error("Conexión interrumpida"))
        : Promise.resolve("confirmado");
    const view = renderHook(() => useResource(loader));
    await waitFor(() =>
      expect(view.result.current.error).toBe("Conexión interrumpida"),
    );
    fail = false;
    await act(async () => {
      await view.result.current.reload();
    });
    expect(view.result.current.data).toBe("confirmado");
    expect(view.result.current.error).toBeNull();
  });
});
