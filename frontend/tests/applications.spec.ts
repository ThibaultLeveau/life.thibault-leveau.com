import { test, expect, type Page } from "@playwright/test";
import type { Task, Workspace } from "../src/apps/tasks/types";

const credentials = {
  username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
  password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
};
async function login(page: Page) {
  const result = await page.request.post("/api/v1/auth/session", {
    data: credentials,
  });
  expect(result.ok()).toBeTruthy();
  const { csrf_token } = await result.json();
  const headers = { "X-CSRF-Token": csrf_token };
  expect(
    (
      await page.request.put("/api/v1/applications/tasks", {
        headers,
        data: { enabled: true },
      })
    ).ok(),
  ).toBeTruthy();
  return headers;
}

test("bibliothèque, accueil, conservation et réactivation depuis les formulaires", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Identifiant").fill(credentials.username);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: /Bonjour/ })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("link", { name: "Ouvrir Tâches", exact: true }).click();
  await page
    .getByRole("button", { name: "Nouvel espace", exact: true })
    .click();
  const name = `Conservation bibliothèque ${Date.now()}`;
  await page.getByLabel("Nom de l’espace").fill(name);
  await page
    .getByRole("button", { name: "Créer l’espace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Titre", { exact: true })
    .fill("Préserver ma tâche");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ajouter la tâche", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Préserver ma tâche", exact: true }),
  ).toBeVisible();
  const workspaces: Workspace[] = await (
    await page.request.get("/api/v1/workspaces")
  ).json();
  const space = workspaces.find((item) => item.name === name)!;
  const task: Task = (
    await (
      await page.request.get(`/api/v1/tasks?workspace_id=${space.id}`)
    ).json()
  ).items[0];
  const history = await (
    await page.request.get(`/api/v1/tasks/${task.id}/events`)
  ).json();
  await page
    .getByRole("link", { name: "Bibliothèque des applications", exact: true })
    .click();
  const toggle = page.getByRole("switch", {
    name: "Activer Tâches",
    exact: true,
  });
  await expect(toggle).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath("bibliotheque-claire.png"),
    fullPage: true,
  });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect((await page.request.get("/api/v1/tasks")).status()).toBe(403);
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await page.getByRole("link", { name: "Accueil", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aucune application activée" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ouvrir Tâches" })).toHaveCount(
    0,
  );
  await page.goto(`/tasks?space=${space.id}`);
  await expect(
    page.getByRole("heading", { name: "Tâches est désactivée" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ouvrir la bibliothèque" }).click();
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  await page.getByRole("link", { name: "Ouvrir Tâches" }).click();
  await page.goto(`/tasks?space=${space.id}`);
  await expect(
    page.getByRole("button", { name: "Préserver ma tâche", exact: true }),
  ).toBeVisible();
  expect(
    await (await page.request.get(`/api/v1/tasks/${task.id}`)).json(),
  ).toEqual(task);
  expect(
    await (await page.request.get(`/api/v1/tasks/${task.id}/events`)).json(),
  ).toEqual(history);
  expect(errors).toEqual([]);
});

test("thème partagé, navigation et bibliothèque à 320 px", async ({
  page,
}, testInfo) => {
  const headers = await login(page);
  expect(
    (
      await page.request.put("/api/v1/preferences", {
        headers,
        data: { theme: "light" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/applications");
  const themeSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/preferences") &&
      response.request().method() === "PUT",
  );
  await page
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("dark");
  expect((await themeSaved).ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("switch", { name: "Activer Tâches" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath(`bibliotheque-sombre-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Accueil", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Ouvrir Tâches" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath(`accueil-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Bibliothèque", exact: true }).click();
  }
  await page
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("system");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(
    page.getByRole("heading", { name: "Connexion", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/applications")).status()).toBe(401);
});

test("erreurs de lecture et écriture sans fausse activation", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/v1/applications", (route) =>
    route.fulfill({ status: 503, json: { detail: "Indisponible" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "momentanément indisponible",
  );
  await page.unroute("**/api/v1/applications");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await page.getByRole("link", { name: "Bibliothèque", exact: true }).click();
  await page.route("**/api/v1/applications/tasks", (route) =>
    route.abort("failed"),
  );
  const toggle = page.getByRole("switch", { name: "Activer Tâches" });
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText("Connexion interrompue");
  await expect(toggle).toBeChecked();
  expect(
    (await (await page.request.get("/api/v1/applications")).json())[0].enabled,
  ).toBe(true);
  await page.unroute("**/api/v1/applications/tasks");
});

test("désactivation externe, retour au premier plan et expiration de session", async ({
  page,
}) => {
  const headers = await login(page);
  await page.goto("/tasks");
  await expect(
    page.getByRole("button", { name: "Nouvel espace", exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.put("/api/v1/applications/tasks", {
        headers,
        data: { enabled: false },
      })
    ).ok(),
  ).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Tâches est désactivée" }),
  ).toBeVisible();
  expect(
    (
      await page.request.put("/api/v1/applications/tasks", {
        headers,
        data: { enabled: true },
      })
    ).ok(),
  ).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Nouvel espace", exact: true }),
  ).toBeVisible();
  expect(
    (await page.request.delete("/api/v1/auth/session", { headers })).ok(),
  ).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Connexion", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("session a expiré");
});
