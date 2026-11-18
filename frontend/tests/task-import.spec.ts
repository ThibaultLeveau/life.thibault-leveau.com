import { expect, test, type Page } from "@playwright/test";

async function seed(page: Page, locale = "fr") {
  const response = await page.request.post("/api/v1/auth/session", {
    data: {
      username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
      password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
    },
  });
  expect(response.ok()).toBeTruthy();
  const { csrf_token } = await response.json();
  const headers = { "X-CSRF-Token": csrf_token };
  const prefs = await page.request.put("/api/v1/preferences", {
    headers,
    data: { locale, theme: "light" },
  });
  expect(prefs.ok()).toBeTruthy();
  const created = await page.request.post("/api/v1/workspaces", {
    headers,
    data: { name: `Import ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const workspace = await created.json();
  await page.goto(`/tasks?space=${workspace.id}`);
  const tasks = async () =>
    (
      await page.request.get(`/api/v1/tasks?workspace_id=${workspace.id}`)
    ).json();
  return { workspace, headers, tasks };
}

for (const locale of ["fr", "en"])
  for (const width of [1440, 320]) {
    test(`import dix lignes ${locale} ${width}, thèmes et clavier`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 950 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const { tasks, headers } = await seed(page, locale);
      const open = page.getByRole("button", {
        name: locale === "fr" ? "Importer des tâches" : "Import tasks",
        exact: true,
      });
      for (const theme of ["light", "dark", "system"]) {
        await page.request.put("/api/v1/preferences", {
          headers,
          data: { theme },
        });
        await page.reload();
        await open.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBeTruthy();
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(open).toBeFocused();
      }
      await open.click();
      const dialog = page.getByRole("dialog");
      const input = dialog.getByRole("textbox");
      await input.fill(
        Array.from({ length: 10 }, (_, i) => `Import task ${i + 1}`).join(
          "\n\n",
        ),
      );
      page.once("dialog", (prompt) => prompt.dismiss());
      await page.keyboard.press("Escape");
      await expect(input).toHaveValue(/Import task 10/);
      const review = dialog.getByRole("button", {
        name: locale === "fr" ? "Vérifier l’import" : "Review import",
        exact: true,
      });
      await review.focus();
      await page.keyboard.press("Enter");
      await expect(dialog.locator("ol li")).toHaveCount(10);
      await expect(
        dialog.getByRole("heading", {
          name: locale === "fr" ? "10 tâches à créer" : "10 tasks to create",
          exact: true,
        }),
      ).toBeVisible();
      await expect(input).toHaveCount(0);
      expect((await tasks()).total).toBe(0);
      const confirm = dialog.getByRole("button", {
        name: locale === "fr" ? "Créer 10 tâches" : "Create 10 tasks",
        exact: true,
      });
      await confirm.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).not.toBeVisible();
      await expect.poll(async () => (await tasks()).total).toBe(10);
      await page.reload();
      await expect(
        page.getByRole("button", { name: /^Import task \d+$/ }),
      ).toHaveCount(10);
      expect(
        (await tasks()).items.map((item: { title: string }) => item.title),
      ).toContain("Import task 10");
    });
  }

test("JSON : aperçu complet, refus atomique, brouillon et correction", async ({
  page,
}) => {
  const { tasks, workspace } = await seed(page);
  await page
    .getByRole("button", { name: "Importer des tâches", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByRole("textbox");
  await dialog
    .getByRole("combobox", { name: "Format", exact: true })
    .selectOption("json");
  await input.fill("{invalid}");
  await dialog
    .getByRole("button", { name: "Vérifier l’import", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("JSON invalide");
  await input.fill(
    JSON.stringify([{ title: "Autre espace", workspace_id: "other" }]),
  );
  await dialog
    .getByRole("button", { name: "Vérifier l’import", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("espace sélectionné");
  const rows = [
    {
      title: "Complète",
      description: "Description à conserver",
      priority: 2,
      due_date: "2090-01-01",
    },
    { title: "Invalide", priority: 8 },
  ];
  await input.fill(JSON.stringify(rows));
  await dialog
    .getByRole("button", { name: "Vérifier l’import", exact: true })
    .click();
  await expect(dialog.locator("ol")).toContainText("Description à conserver");
  await dialog
    .getByRole("button", { name: "Créer 2 tâches", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Modifier le lot" }),
  ).toBeEnabled();
  expect((await tasks()).total).toBe(0);
  await dialog.getByRole("button", { name: "Modifier le lot" }).click();
  await expect(input).toHaveValue(JSON.stringify(rows));
  rows[1].priority = 3;
  await input.fill(JSON.stringify(rows));
  await dialog
    .getByRole("button", { name: "Vérifier l’import", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Créer 2 tâches", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const saved = (await tasks()).items.find(
    (item: { title: string }) => item.title === "Complète",
  );
  expect(saved).toMatchObject({
    workspace_id: workspace.id,
    priority: 2,
    description: "Description à conserver",
    due_date: "2090-01-01",
  });
});
