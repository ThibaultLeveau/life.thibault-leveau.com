import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { Recipe, ShoppingList } from "../src/apps/recipes/types";

let auth: BrowserContext,
  cookies: Awaited<ReturnType<BrowserContext["cookies"]>>,
  headers: Record<string, string>;
let recipe: Recipe, shopping: ShoppingList, template: ShoppingList;
const stamp = Date.now();
const recipeName = `Risotto du jardin ${stamp}`,
  listName = `Panier du samedi ${stamp}`,
  templateName = `Mes essentiels ${stamp}`;
test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ browser }) => {
  auth = await browser.newContext({
    baseURL: process.env.LIFE_E2E_URL ?? "http://127.0.0.1:18106",
  });
  const login = await auth.request.post("/api/v1/auth/session", {
    data: {
      username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
      password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
    },
  });
  expect(login.ok()).toBeTruthy();
  headers = { "X-CSRF-Token": (await login.json()).csrf_token };
  cookies = await auth.cookies();
  for (const id of ["recipes", "tracking"])
    expect(
      (
        await auth.request.put(`/api/v1/applications/${id}`, {
          headers,
          data: { enabled: true },
        })
      ).ok(),
    ).toBeTruthy();
  await auth.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
});
test.afterAll(async () => {
  await auth?.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
  await auth?.close();
});
async function tab(page: Page, name: string) {
  if (!(await page.locator(".application-sidebar").isVisible()))
    await page
      .getByRole("button", { name: "Ouvrir la navigation", exact: true })
      .click();
  await page
    .locator(".application-sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}
async function addIngredient(
  page: Page,
  name: string,
  amount: string,
  unit: string,
  custom = false,
) {
  const picker = page.locator(".recipes-picker");
  await picker.getByLabel("Ingrédient ou article", { exact: true }).fill(name);
  if (custom) {
    await picker.getByLabel("Unité", { exact: true }).selectOption(unit);
    await picker
      .getByRole("button", {
        name: `Créer « ${name} » dans mon catalogue`,
        exact: true,
      })
      .click();
  } else
    await picker
      .locator(".recipes-suggestions")
      .getByRole("button", { name: new RegExp(`^${name} `) })
      .first()
      .click();
  await picker.getByLabel("Quantité", { exact: true }).fill(amount);
  await picker.getByLabel("Unité", { exact: true }).selectOption(unit);
  await picker.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(
    picker.getByLabel("Ingrédient ou article", { exact: true }),
  ).toHaveValue("");
}
async function currentList(
  page: Page,
  id = shopping.id,
): Promise<ShoppingList> {
  return (await page.request.get(`/api/v1/recipes/lists/${id}`)).json();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test("recette, catalogue bilingue, ingrédient inconnu et portions calculées", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/recipes");
  await page
    .getByRole("button", { name: "Nouvelle recette", exact: true })
    .click();
  await page.getByLabel("Nom", { exact: true }).fill(recipeName);
  await page.getByLabel("Nombre de personnes", { exact: true }).fill("2");
  await addIngredient(page, "Riz basmati", "150", "g");
  await addIngredient(page, "Tomate", "2", "u");
  await addIngredient(page, `Épice du jardin ${stamp}`, "0.5", "tsp", true);
  await addIngredient(page, "Lait", "250", "ml");
  await addIngredient(page, "Sel", "100", "mg");
  await addIngredient(page, "Huile d’olive", "1.5", "tbsp");
  await page
    .getByLabel("Préparation", { exact: true })
    .fill(
      "Faire revenir les tomates. Ajouter le riz et laisser mijoter doucement.",
    );
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: recipeName, exact: true }),
  ).toBeVisible();
  recipe = (
    await (
      await page.request.get(
        `/api/v1/recipes/recipes?q=${encodeURIComponent(recipeName)}`,
      )
    ).json()
  ).items[0];
  expect(recipe.items).toHaveLength(6);
  expect(recipe.base_servings).toBe(2);
  expect(recipe.items.map((item) => item.unit)).toEqual([
    "g", "u", "tsp", "ml", "mg", "tbsp",
  ]);
  await page.reload();
  await expect(page.locator(".recipes-ingredient-list")).toContainText(
    "c. à café",
  );
  await expect(page.locator(".recipes-ingredient-list")).toContainText(
    "c. à soupe",
  );
  await page.getByLabel("Nombre de personnes", { exact: true }).fill("6");
  await expect(
    page.locator(".recipes-ingredient-list").getByText("450 g", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await (
        await page.request.get(`/api/v1/recipes/recipes/${recipe.id}`)
      ).json()
    ).items[0].quantity,
  ).toBe("150.000000");
  await page.screenshot({
    path: info.outputPath("recipes-desktop.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("liste, import, cumul exact, achats partiels et fin des courses", async ({
  page,
}, info) => {
  await page.goto("/recipes?tab=lists");
  await page
    .getByRole("button", { name: "Nouvelle liste", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nom", { exact: true })
    .fill(listName);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: listName, exact: true }),
  ).toBeVisible();
  await addIngredient(page, "Riz basmati", "50", "g");
  await page
    .getByRole("button", { name: "Importer une recette", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Rechercher", { exact: true }).fill(recipeName);
  await dialog.getByRole("button", { name: new RegExp(recipeName) }).click();
  await dialog.getByLabel("Nombre de personnes", { exact: true }).fill("4");
  await dialog
    .getByRole("button", { name: "Importer les ingrédients", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  shopping = (
    await (
      await page.request.get(
        `/api/v1/recipes/lists?q=${encodeURIComponent(listName)}`,
      )
    ).json()
  ).items[0];
  expect(shopping.items).toHaveLength(6);
  expect(
    Number(shopping.items.find((i) => i.name === "Riz basmati")!.quantity),
  ).toBe(350);
  await page.getByRole("button", { name: "Au magasin", exact: true }).click();
  const rice = page
    .locator(".recipes-shopping-item")
    .filter({ hasText: "Riz basmati" });
  await rice.locator(".recipes-check-line").click();
  await expect(rice.getByRole("checkbox")).toBeChecked();
  await addIngredient(page, "Riz basmati", "20", "g");
  await expect(rice.getByRole("checkbox")).not.toBeChecked();
  await expect(rice).toContainText("Déjà pris : 350 g · total : 370 g");
  await page.setViewportSize({ width: 320, height: 812 });
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("shopping-mobile.png"),
    fullPage: true,
  });
  for (const item of (await currentList(page)).items) {
    const row = page
      .locator(".recipes-shopping-item")
      .filter({ hasText: item.name });
    if (!(await row.getByRole("checkbox").isChecked())) {
      await row.locator(".recipes-check-line").click();
      await expect(row.getByRole("checkbox")).toBeChecked();
    }
  }
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Terminer les courses", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Terminer les courses", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Rouvrir la liste", exact: true }),
  ).toBeVisible();
  shopping = await currentList(page);
  expect(shopping.completed_at).toBeTruthy();
  expect(shopping.items.every((i) => i.checked)).toBe(true);
});

test("modèle depuis une ancienne liste, copie vierge et modèle manuel", async ({
  page,
}) => {
  await page.goto(`/recipes?tab=lists&id=${shopping.id}`);
  await page
    .getByRole("button", { name: "Enregistrer comme modèle", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nom", { exact: true })
    .fill(templateName);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: templateName, exact: true }),
  ).toBeVisible();
  template = (
    await (
      await page.request.get(
        `/api/v1/recipes/lists?kind=template&q=${encodeURIComponent(templateName)}`,
      )
    ).json()
  ).items[0];
  expect(template.items.every((i) => Number(i.purchased_quantity) === 0)).toBe(
    true,
  );
  await page
    .getByRole("button", { name: "Créer une liste", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nom", { exact: true })
    .fill(`Prochain panier ${stamp}`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Prochain panier ${stamp}`,
      exact: true,
    }),
  ).toBeVisible();
  shopping = (
    await (
      await page.request.get(
        `/api/v1/recipes/lists?q=${encodeURIComponent(`Prochain panier ${stamp}`)}`,
      )
    ).json()
  ).items[0];
  expect(shopping.completed_at).toBeNull();
  expect(shopping.items.every((i) => !i.checked)).toBe(true);
  await tab(page, "Mes modèles");
  await page
    .getByRole("button", { name: "Nouveau modèle", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nom", { exact: true })
    .fill(`Petit déjeuner ${stamp}`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `Petit déjeuner ${stamp}`, exact: true }),
  ).toBeVisible();
  await addIngredient(page, "Œuf", "6", "u");
  await expect(page.locator(".recipes-shopping-item")).toContainText("Œuf");
});

test("erreur réseau visible, reprise, clavier et désactivation sans perte", async ({
  page,
}) => {
  await page.goto(`/recipes?tab=lists&id=${shopping.id}&shop=1`);
  const row = page
    .locator(".recipes-shopping-item")
    .filter({ hasText: "Riz basmati" });
  await page.route(
    /\/api\/v1\/recipes\/lists\/[^/]+\/items\/[^/]+\/check$/,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "synthetic outage" }),
      }),
    { times: 1 },
  );
  await row.locator(".recipes-check-line").click();
  await expect(page.getByRole("alert")).toContainText("indisponible");
  await expect(row.getByRole("checkbox")).not.toBeChecked();
  await row.getByRole("checkbox").focus();
  await page.keyboard.press("Space");
  await expect(row.getByRole("checkbox")).toBeChecked();
  shopping = await currentList(page);
  await page.request.put("/api/v1/applications/recipes", {
    headers,
    data: { enabled: false },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /est désactivée/ }),
  ).toBeVisible();
  expect(
    (await page.request.get(`/api/v1/recipes/lists/${shopping.id}`)).status(),
  ).toBe(403);
  await page.request.put("/api/v1/applications/recipes", {
    headers,
    data: { enabled: true },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: shopping.title, exact: true }),
  ).toBeVisible();
  expect(await currentList(page)).toEqual(shopping);

  // A second device wins: reject the stale checkbox, then explicitly discard
  // the local ingredient draft when reloading the current server version.
  const pending = page.getByLabel("Ingrédient ou article", { exact: true });
  await pending.fill("Brouillon non enregistré");
  const renamed = await page.request.put(
    `/api/v1/recipes/lists/${shopping.id}`,
    {
      headers,
      data: {
        title: `Panier synchronisé ${stamp}`,
        expected_version: shopping.version,
      },
    },
  );
  expect(renamed.ok()).toBeTruthy();
  await row.locator(".recipes-check-line").click();
  await expect(page.getByRole("alert")).toContainText("Cet élément a changé");
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(pending).toHaveValue("Brouillon non enregistré");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Recharger cet élément", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Panier synchronisé ${stamp}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(pending).toHaveValue("");
  await expect(row.getByRole("checkbox")).toBeChecked();
  shopping = await currentList(page);
});

test("édition, archives et conservation des brouillons", async ({ page }) => {
  await page.goto(`/recipes?tab=recipes&id=${recipe.id}`);
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  await page.getByLabel("Nom", { exact: true }).fill(`${recipeName} brouillon`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(page.getByLabel("Nom", { exact: true })).toHaveValue(
    `${recipeName} brouillon`,
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await expect(page.getByLabel("Nom", { exact: true })).toHaveValue(
    `${recipeName} brouillon`,
  );
  await page.getByLabel("Nom", { exact: true }).fill(recipeName);
  await page
    .getByLabel("Préparation", { exact: true })
    .fill("Faire revenir, mijoter puis servir bien chaud.");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".recipes-instructions")).toContainText(
    "servir bien chaud",
  );
  await page.getByRole("button", { name: "Archiver", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Archives", exact: true }),
  ).toBeVisible();
  await page.locator(".recipes-card").filter({ hasText: recipeName }).click();
  await page.getByRole("button", { name: "Restaurer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mes recettes", exact: true }),
  ).toBeVisible();
});

test("mode magasin FR/EN, thèmes, mobile et quêtes dans Suivi", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  for (const locale of ["fr", "en"]) {
    for (const theme of ["light", "dark", "system"]) {
      await page.request.put("/api/v1/preferences", {
        headers,
        data: { locale, theme },
      });
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/recipes?tab=lists&id=${shopping.id}&shop=1`);
        await expect(page.locator(".recipes-shop")).toBeVisible();
        await expect(page.locator(".progression-level-number")).toHaveText(
          /\d+/,
        );
        await noOverflow(page);
        await expect(
          page
            .locator(".recipes-shopping-item")
            .filter({ hasText: `Épice du jardin ${stamp}` }),
        ).toBeVisible();
        await expect(
          page.locator(".recipes-shopping-item").filter({
            hasText: `Épice du jardin ${stamp}`,
          }),
        ).toContainText(locale === "fr" ? "c. à café" : "tsp");
        await expect(
          page.locator(".recipes-shopping-item").filter({
            hasText: locale === "fr" ? "Huile d’olive" : "Olive oil",
          }),
        ).toContainText(locale === "fr" ? "c. à soupe" : "tbsp");
        if (locale === "en")
          await expect(
            page
              .locator(".recipes-shopping-item")
              .filter({ hasText: "Tomato" }),
          ).toBeVisible();
        await page.screenshot({
          path: info.outputPath(`shopping-${locale}-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }
  await page.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
  await page.goto("/tracking?tab=achievements&application=recipes");
  await expect(
    page
      .locator(".progression-app-picker")
      .getByRole("button", { name: /Recettes & Liste de courses/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    (
      await (
        await page.request.get("/api/v1/progression/recipes/quests")
      ).json()
    ).total,
  ).toBe(60);
  const source = (
    await (await page.request.get("/api/v1/integrations")).json()
  ).find((s: { id: string }) => s.id === "recipes");
  expect(source.metrics).toHaveLength(4);
});

test("import depuis une recette et commandes de liste par API/interface", async ({
  page,
}) => {
  const before = await currentList(page);
  const riceBefore = Number(
    before.items.find((i) => i.name === "Riz basmati")!.quantity,
  );
  await page.goto(`/recipes?tab=recipes&id=${recipe.id}`);
  await page
    .getByRole("button", { name: "Ajouter à une liste", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Rechercher", { exact: true }).fill(shopping.title);
  await dialog
    .getByRole("button", { name: new RegExp(shopping.title) })
    .click();
  await dialog.getByLabel("Nombre de personnes", { exact: true }).fill("3");
  await dialog
    .getByRole("button", { name: "Importer les ingrédients", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: shopping.title, exact: true }),
  ).toBeVisible();
  shopping = await currentList(page);
  expect(
    Number(shopping.items.find((i) => i.name === "Riz basmati")!.quantity),
  ).toBe(riceBefore + 225);
  const rice = page
    .locator(".recipes-shopping-item")
    .filter({ hasText: "Riz basmati" });
  await rice
    .getByRole("button", { name: "Modifier · Riz basmati", exact: true })
    .click();
  await rice.getByLabel("Quantité", { exact: true }).fill("600");
  await rice.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(rice.locator(".recipes-item-edit")).toHaveCount(0);
  expect(
    Number(
      (await currentList(page)).items.find((i) => i.name === "Riz basmati")!
        .quantity,
    ),
  ).toBe(600);
  await page.getByRole("button", { name: "Renommer", exact: true }).click();
  const renamed = shopping.title + " prêt";
  await page
    .getByRole("dialog")
    .getByLabel("Nom", { exact: true })
    .fill(renamed);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: renamed, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archiver", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Restaurer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restaurer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Au magasin", exact: true }),
  ).toBeVisible();
  shopping = await currentList(page);
});
