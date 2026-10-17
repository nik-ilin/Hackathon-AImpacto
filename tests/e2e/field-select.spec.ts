import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Field } from "../../src/components/ui";

test("el selector de disciplina encuentra el Field real por su rol accesible", async ({
  page,
}) => {
  // Browser regression for the collaboration locator, independent of backend.
  // A wrapping label's text includes its options, whereas the accessible name
  // of the combobox excludes those options. Exact getByLabel used to find zero.
  await page.setContent(
    renderToStaticMarkup(
      createElement(Field, {
        label: "Disciplina",
        children: createElement(
          "select",
          null,
          createElement("option", { value: "" }, "Todas las disciplinas"),
          createElement("option", { value: "physics" }, "Física"),
        ),
      }),
    ),
  );
  const discipline = page.getByRole("combobox", {
    name: "Disciplina",
    exact: true,
  });
  await expect(discipline).toHaveCount(1);
  await discipline.selectOption({ label: "Física" });
  await expect(discipline).toHaveValue("physics");
});
