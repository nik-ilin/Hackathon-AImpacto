import { expect, test } from "@playwright/test";

test("landing accesible y navegación responsive", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Tu próximo avance",
  );
  await expect(
    page.getByText("NexoLab acompaña toda la trayectoria investigadora:", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cómo funciona" }).click();
  await expect(page).toHaveURL(/#como-funciona$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/landing-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("sin backend se explican los pasos de configuración", async ({ page }) => {
  test.skip(
    Boolean(process.env.NEXOLAB_E2E_BACKEND),
    "Este caso prueba exclusivamente configuración ausente.",
  );
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Conecta NexoLab a Supabase" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Iniciar sesión" }),
  ).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Conecta NexoLab a Supabase" }),
  ).toBeVisible();
});
