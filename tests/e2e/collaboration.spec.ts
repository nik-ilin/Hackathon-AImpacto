import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

test("dos cuentas colaboran desde registro hasta proyecto privado", async ({
  browser,
}) => {
  test.skip(
    !process.env.NEXOLAB_E2E_BACKEND,
    "Requiere npm run test:e2e:local y Supabase local real.",
  );
  test.setTimeout(120000);
  const run = randomUUID().slice(0, 8);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();
  async function register(page: Page, label: string) {
    await page.goto("/register");
    await page
      .getByLabel("Correo electrónico")
      .fill(`${label}-${run}@example.test`);
    await page
      .getByLabel("Contraseña", { exact: false })
      .fill(`Local-${randomUUID()}-9!`);
    await page.getByRole("button", { name: "Crear mi cuenta" }).click();
    await expect(page).toHaveURL(/onboarding/);
    await page.getByLabel("Nombre completo").fill(`Persona ${label} ${run}`);
    await page.getByLabel("Visibilidad del perfil").selectOption("public");
    await page.getByRole("checkbox", { name: "Física", exact: true }).check();
    await page.getByRole("button", { name: "Guardar y comenzar" }).click();
    await expect(page).toHaveURL(/explore/);
  }
  try {
    await register(owner, "propietaria");
    await owner.goto("/groups/new");
    await owner.getByLabel("Nombre del grupo").fill(`Grupo E2E ${run}`);
    await owner
      .getByLabel("Descripción", { exact: true })
      .fill(
        "Investigación reproducible en física y colaboración interdisciplinar.",
      );
    await owner.getByRole("checkbox", { name: "Física", exact: true }).check();
    await owner
      .getByRole("button", { name: "Crear grupo", exact: true })
      .click();
    await expect(
      owner.getByRole("heading", { name: `Grupo E2E ${run}`, exact: true }),
    ).toBeVisible();
    const groupUrl = owner.url();
    await register(member, "colaboradora");
    await member.getByLabel("Buscar un grupo").fill(run);
    await member
      .getByLabel("Disciplina", { exact: true })
      .selectOption({ label: "Física" });
    await member.getByRole("button", { name: "Buscar", exact: true }).click();
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
      owner.getByRole("heading", { name: `Proyecto E2E ${run}`, exact: true }),
    ).toBeVisible();
    await member.goto(owner.url());
    await expect(
      member.getByRole("heading", { name: `Proyecto E2E ${run}`, exact: true }),
    ).toBeVisible();
  } finally {
    await ownerContext.close();
    await memberContext.close();
  }
});
