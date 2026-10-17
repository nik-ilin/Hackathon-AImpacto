import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("dos cuentas colaboran desde registro hasta proyecto privado", async ({
  browser,
}, testInfo) => {
  test.skip(
    !process.env.NEXOLAB_E2E_BACKEND,
    "Requiere npm run test:e2e:local y Supabase local real.",
  );
  test.setTimeout(120000);
  const run = randomUUID().slice(0, 8);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  // These manually created contexts do not use the fixture's timeout setters.
  for (const context of [ownerContext, memberContext]) {
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(20000);
  }
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();
  const diagnostics: {
    steps: { name: string; state: "started" | "completed" | "failed" }[];
    events: { account: string; kind: string; path?: string; status?: number }[];
    controls: Record<string, number>;
  } = { steps: [], events: [], controls: {} };
  function pathOnly(url: string) {
    return new URL(url).pathname;
  }
  for (const [account, page] of [
    ["owner", owner],
    ["member", member],
  ] as const) {
    // Only paths, numeric status and static event names; never query/hash,
    // console messages, headers, bodies, input values or raw Error messages.
    const record = (event: (typeof diagnostics.events)[number]) => {
      diagnostics.events.push(event);
      if (diagnostics.events.length > 100) diagnostics.events.shift();
    };
    page.on("pageerror", () => record({ account, kind: "pageerror" }));
    page.on("console", (message) => {
      if (message.type() === "error")
        record({ account, kind: "console-error" });
    });
    page.on("requestfailed", (request) =>
      record({
        account,
        kind: `requestfailed:${request.method()}`,
        path: pathOnly(request.url()),
      }),
    );
    page.on("response", (response) => {
      if (response.status() >= 400)
        record({
          account,
          kind: `response:${response.request().method()}`,
          path: pathOnly(response.url()),
          status: response.status(),
        });
    });
  }
  async function step<T>(name: string, action: () => Promise<T>): Promise<T> {
    return test.step(name, async () => {
      diagnostics.steps.push({ name, state: "started" });
      try {
        const result = await action();
        diagnostics.steps.push({ name, state: "completed" });
        return result;
      } catch (error) {
        diagnostics.steps.push({ name, state: "failed" });
        throw error;
      }
    });
  }
  async function register(page: Page, label: string) {
    await step(`Registro de ${label}`, async () => {
      await page.goto("/register");
      await page
        .getByLabel("Correo electrónico")
        .fill(`${label}-${run}@example.test`);
      await page
        .getByLabel("Contraseña", { exact: false })
        .fill(`Local-${randomUUID()}-9!`);
      await page.getByRole("button", { name: "Crear mi cuenta" }).click();
      await expect(page).toHaveURL(/onboarding/);
    });
    await step(`Perfil obligatorio de ${label}`, async () => {
      await page.getByLabel("Nombre completo").fill(`Persona ${label} ${run}`);
      await page.getByLabel("Visibilidad del perfil").selectOption("public");
      await page.getByRole("checkbox", { name: "Física", exact: true }).check();
      await page.getByRole("button", { name: "Guardar y comenzar" }).click();
      await expect(page).toHaveURL(/explore/);
    });
  }
  let cleanupErrors: unknown[];
  try {
    await register(owner, "propietaria");
    const groupUrl = await step("Crear grupo como propietaria", async () => {
      await owner.goto("/groups/new");
      await owner.getByLabel("Nombre del grupo").fill(`Grupo E2E ${run}`);
      await owner
        .getByLabel("Descripción", { exact: true })
        .fill(
          "Investigación reproducible en física y colaboración interdisciplinar.",
        );
      await owner
        .getByRole("checkbox", { name: "Física", exact: true })
        .check();
      await owner
        .getByRole("button", { name: "Crear grupo", exact: true })
        .click();
      await expect(
        owner.getByRole("heading", { name: `Grupo E2E ${run}`, exact: true }),
      ).toBeVisible();
      return owner.url();
    });
    await register(member, "colaboradora");
    await step(
      "Buscar grupo como colaboradora: texto y disciplina",
      async () => {
        diagnostics.controls.disciplineExactLabel = await member
          .getByLabel("Disciplina", { exact: true })
          .count();
        diagnostics.controls.disciplineCombobox = await member
          .getByRole("combobox", { name: "Disciplina", exact: true })
          .count();
        await member.getByLabel("Buscar un grupo").fill(run);
        await member
          .getByRole("combobox", { name: "Disciplina", exact: true })
          .selectOption({ label: "Física" });
        await member
          .getByRole("button", { name: "Buscar", exact: true })
          .click();
      },
    );
    await step("Abrir resultado y solicitar incorporación", async () => {
      await member
        .getByRole("link", { name: `Grupo E2E ${run}`, exact: true })
        .click();
      await member
        .getByLabel("Presentación (opcional)")
        .fill(`Me interesa colaborar ${run}`);
      await member
        .getByRole("button", { name: "Solicitar incorporación" })
        .click();
      await expect(
        member
          .getByRole("status")
          .filter({ hasText: "Tu solicitud está pendiente" }),
      ).toBeVisible();
    });
    await step("Aprobar solicitud como propietaria", async () => {
      await owner.goto("/requests");
      const request = owner
        .locator("article")
        .filter({ hasText: `Grupo E2E ${run}` });
      await request
        .getByRole("button", { name: "Aprobar incorporación" })
        .click();
      await expect(
        owner.getByRole("status").filter({ hasText: "Solicitud aprobada" }),
      ).toBeVisible();
    });
    await step(
      "Comprobar membresía y permisos de la colaboradora",
      async () => {
        await member.goto("/my-groups");
        await expect(
          member.getByRole("link", { name: `Grupo E2E ${run}`, exact: true }),
        ).toHaveCount(1);
        await member.goto(groupUrl);
        await expect(
          member.getByText(`Persona colaboradora ${run}`, { exact: true }),
        ).toHaveCount(1);
        await expect(
          member.getByRole("link", { name: "Editar grupo" }),
        ).toHaveCount(0);
        await expect(
          member.getByRole("link", { name: "Crear proyecto" }),
        ).toHaveCount(0);
      },
    );
    await step("Crear proyecto privado como propietaria", async () => {
      await owner.goto(groupUrl);
      await owner.getByRole("link", { name: "Crear proyecto" }).click();
      await owner.getByLabel("Título del proyecto").fill(`Proyecto E2E ${run}`);
      await owner
        .getByLabel("Descripción", { exact: true })
        .fill(
          "Proyecto privado para verificar acceso autorizado de colaboradores aceptados.",
        );
      await owner
        .getByRole("button", { name: "Crear proyecto", exact: true })
        .click();
      await expect(
        owner.getByRole("heading", {
          name: `Proyecto E2E ${run}`,
          exact: true,
        }),
      ).toBeVisible();
    });
    await step("Leer proyecto privado como miembro aprobado", async () => {
      await member.goto(owner.url());
      await expect(
        member.getByRole("heading", {
          name: `Proyecto E2E ${run}`,
          exact: true,
        }),
      ).toBeVisible();
    });
    await step("Crear necesidad de incorporación en el proyecto", async () => {
      await owner.getByRole("link", { name: "Crear necesidad de incorporación" }).click();
      await owner.getByLabel("Título de la necesidad").fill(`Necesidad E2E ${run}`);
      await owner.getByLabel("Descripción de la contribución").fill("Contribuir al análisis científico del proyecto.");
      await owner.getByLabel("Capacidades requeridas", { exact: false }).fill("Python, SQL");
      await owner.getByRole("button", { name: "Guardar necesidad" }).click();
      await expect(owner.getByRole("heading", { name: `Necesidad E2E ${run}`, exact: true })).toBeVisible();
    });
    await step("Comparar perfil y guardar feedback explícito", async () => {
      await member.goto("/profile");
      await member.getByLabel("Competencias", { exact: false }).fill("python, Julia");
      await member.getByRole("button", { name: "Guardar perfil" }).click();
      await expect(member.getByRole("status").filter({ hasText: "Perfil e intereses guardados correctamente" })).toBeVisible();
      await member.goto("/needs");
      await member.getByRole("link", { name: `Necesidad E2E ${run}` }).click();
      await member.getByRole("button", { name: "Comparar mi perfil" }).click();
      await expect(member.getByText("50 % · 1 de 2 capacidades declaradas.")).toBeVisible();
      await member.getByLabel("¿Te resulta útil?", { exact: false }).selectOption("useful");
      await member.getByLabel("Comentario opcional").fill("Coincidencia de Python confirmada");
      await member.getByRole("button", { name: "Guardar feedback" }).click();
      await expect(member.getByRole("status").filter({ hasText: "Feedback guardado" })).toBeVisible();
    });
  } catch (error) {
    try {
      await writeFile(
        testInfo.outputPath("safe-diagnostics.json"),
        JSON.stringify(
          {
            ...diagnostics,
            pages: {
              owner: pathOnly(owner.url()),
              member: pathOnly(member.url()),
            },
          },
          null,
          2,
        ),
      );
    } catch {
      // Diagnostic IO must not replace the assertion/action that failed.
    }
    throw error;
  } finally {
    const cleanup = await Promise.allSettled([
      ownerContext.close(),
      memberContext.close(),
    ]);
    cleanupErrors = cleanup
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason);
  }
  // An error rethrown above exits after finally, preserving the original cause.
  if (cleanupErrors.length)
    throw new AggregateError(
      cleanupErrors,
      "No se pudieron cerrar los contextos E2E",
    );
});
