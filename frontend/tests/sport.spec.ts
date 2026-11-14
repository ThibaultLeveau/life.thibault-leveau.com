import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { ExercisePage, Training, Workout } from "../src/apps/sport/types";

const credentials = {
  username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
  password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
};
let auth: BrowserContext;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let headers: Record<string, string>;
test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ browser }) => {
  auth = await browser.newContext({
    baseURL: process.env.LIFE_E2E_URL ?? "http://127.0.0.1:18106",
  });
  const login = await auth.request.post("/api/v1/auth/session", {
    data: credentials,
  });
  expect(login.ok()).toBeTruthy();
  headers = { "X-CSRF-Token": (await login.json()).csrf_token };
  cookies = await auth.cookies();
});
test.afterAll(async () => {
  await auth?.close();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
  expect(
    (
      await page.request.put("/api/v1/applications/sport", {
        headers,
        data: { enabled: true },
      })
    ).ok(),
  ).toBeTruthy();
  const active: Training | null = await (
    await page.request.get("/api/v1/sport/sessions/active")
  ).json();
  if (active)
    expect(
      (
        await page.request.put(`/api/v1/sport/sessions/${active.id}/finish`, {
          headers,
          data: { expected_version: active.version, outcome: "cancelled" },
        })
      ).ok(),
    ).toBeTruthy();
});
async function tab(page: Page, name: string) {
  const desktop = page.locator(".sport-sidebar");
  if (await desktop.isVisible())
    await desktop.getByRole("button", { name, exact: true }).click();
  else {
    await page
      .getByRole("button", { name: "Ouvrir la navigation", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name, exact: true })
      .click();
  }
}
async function createApiWorkout(page: Page, name: string) {
  const ex: ExercisePage = await (
    await page.request.get("/api/v1/sport/exercises?q=burpees&kind=reps")
  ).json();
  const response = await page.request.post("/api/v1/sport/workouts", {
    headers,
    data: {
      name,
      entries: [{ exercise_id: ex.items[0].id, sets: 1, target: { reps: 10 } }],
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Workout;
}

test("Sport : bibliothèque, séance mixte, repos, mensurations et statistiques par interface", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.request.put("/api/v1/applications/sport", {
    headers,
    data: { enabled: false },
  });
  await page.goto("/applications");
  const toggle = page.getByRole("switch", {
    name: "Activer Sport",
    exact: true,
  });
  await expect(toggle).not.toBeChecked();
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  await page.getByRole("link", { name: "Ouvrir Sport", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Séances", exact: true }),
  ).toBeVisible();
  await tab(page, "Réglages");
  await page
    .getByLabel("Temps de repos entre les séries (secondes)")
    .fill("120");
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(page.getByRole("status")).toHaveText("Réglages enregistrés.");
  await tab(page, "Séances");
  await page
    .getByRole("button", { name: "Nouvelle séance", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const name = `Séance mixte ${Date.now()}`;
  await dialog.getByLabel("Nom de la séance").fill(name);
  for (const [i, query] of [
    "Développé couché à la barre",
    "Course sur tapis",
    "Marche du fermier",
    "Burpees",
  ].entries()) {
    if (i)
      await dialog
        .getByRole("button", { name: "Ajouter un exercice", exact: true })
        .click();
    await dialog.getByLabel("Rechercher un exercice").fill(query);
    await dialog
      .locator(".sport-picker-item")
      .filter({ hasText: query })
      .first()
      .click();
    await dialog.getByLabel("Nombre de séries").nth(i).fill("1");
  }
  await dialog.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(dialog).toHaveCount(0);
  const card = page
    .locator(".sport-workout")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: /Lancer la séance/ }).click();
  await expect(
    page.getByRole("heading", { name: "Entraînement", exact: true }),
  ).toBeVisible();
  const values = [
    { "Charge totale (kg)": "60", "Répétitions (rép.)": "10" },
    { "Distance (m)": "1000", "Durée (s)": "360" },
    { "Charge totale (kg)": "40", "Distance (m)": "30" },
    { "Répétitions (rép.)": "20" },
  ];
  for (let i = 0; i < 4; i++) {
    await page
      .locator(".sport-session-exercise")
      .nth(i)
      .getByRole("button")
      .click();
    for (const [label, value] of Object.entries(values[i]))
      await page
        .getByRole("dialog")
        .getByLabel(label, { exact: true })
        .fill(value!);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Valider la série", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("timer")).not.toHaveText("00:00");
    if (i === 0) {
      await page.reload();
      await expect(page.locator(".sport-set.is-complete")).toHaveCount(1);
      await expect(page.getByRole("timer")).not.toHaveText("00:00");
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("sport-entrainement.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Terminer l’entraînement", exact: true })
    .click();
  await page.getByLabel("Ressenti et notes").fill("Séance de recette");
  await page.getByRole("button", { name: "Enregistrer les résultats" }).click();
  await expect(
    page.locator(".sport-history-row").filter({ hasText: name }),
  ).toContainText("100");
  const history = await (
    await page.request.get("/api/v1/sport/sessions")
  ).json();
  const stored: Training = history.items.find((t: Training) => t.name === name);
  expect(stored.sets).toHaveLength(4);
  expect(stored.status).toBe("completed");
  expect(stored.metrics[0].volume_kg).toBe(600);
  // A second comparable session exercises the persisted reference and its visible score.
  let next: Training = await (
    await page.request.post("/api/v1/sport/sessions", {
      headers,
      data: { workout_id: stored.workout_id, expected_version: 1 },
    })
  ).json();
  const improved = [
    { weight_kg: 72.2, reps: 10 },
    { distance_m: 1000, duration_seconds: 300 },
    { weight_kg: 48.2, distance_m: 30 },
    { reps: 24 },
  ];
  for (const [index, values] of improved.entries()) {
    const response = await page.request.put(
      `/api/v1/sport/sessions/${next.id}/sets/${index}/0`,
      { headers, data: { expected_version: next.version, values } },
    );
    expect(response.ok()).toBeTruthy();
    next = await response.json();
  }
  const completed = await page.request.put(
    `/api/v1/sport/sessions/${next.id}/finish`,
    { headers, data: { expected_version: next.version, outcome: "completed" } },
  );
  expect(completed.ok()).toBeTruthy();
  expect((await completed.json()).score).toBe(120);
  await page.reload();
  await expect(page.locator(".sport-history-row").first()).toContainText("120");

  await tab(page, "Mensurations");
  await page.getByRole("button", { name: "Nouveau relevé" }).click();
  await page.getByLabel("Date du relevé").fill("2026-01-15");
  await page.getByLabel("Poids (kg)", { exact: true }).fill("80");
  await page.getByLabel("Taille (cm)", { exact: true }).fill("90");
  await page
    .getByRole("button", { name: "Enregistrer les mensurations" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Nouveau relevé" }).click();
  await page.getByLabel("Date du relevé").fill("2026-02-15");
  await page.getByLabel("Poids (kg)", { exact: true }).fill("78");
  await page.getByLabel("Taille (cm)", { exact: true }).fill("88");
  await page
    .getByRole("button", { name: "Enregistrer les mensurations" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await tab(page, "Statistiques");
  await page.getByLabel("Du", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Au", { exact: true }).fill("2026-12-31");
  await expect(
    page.getByRole("img", { name: /Poids : 2 relevés/ }),
  ).toBeVisible();
  await page
    .locator(".sport-chart")
    .filter({ has: page.getByRole("heading", { name: "Poids", exact: true }) })
    .getByText("Voir les valeurs", { exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "78", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("sport-statistiques.png"),
    fullPage: true,
  });
  await page
    .locator(".sport-sidebar")
    .getByRole("link", { name: "Bibliothèque des applications" })
    .click();
  await page
    .getByRole("switch", { name: "Activer Sport", exact: true })
    .click();
  expect((await page.request.get("/api/v1/sport/sessions")).status()).toBe(403);
  await page.goto("/sport");
  await expect(
    page.getByRole("heading", { name: "Sport est désactivée" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ouvrir la bibliothèque" }).click();
  await page
    .getByRole("switch", { name: "Activer Sport", exact: true })
    .click();
  const restored = await (
    await page.request.get(`/api/v1/sport/sessions/${stored.id}`)
  ).json();
  for (const key of ["entries", "sets", "started_at", "finished_at", "score"])
    expect(restored[key]).toEqual(stored[key as keyof Training]);
  expect(errors).toEqual([]);
});

test("Sport : création personnelle, mobile, clavier, archives et validation en erreur", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/sport?tab=exercises");
  await page
    .getByRole("button", { name: "Nouvel exercice", exact: true })
    .click();
  const name = `Porté personnalisé ${Date.now()}`;
  await page.getByLabel("Nom de l’exercice").fill(name);
  await page.getByLabel("Type de saisie").selectOption("weight_distance");
  await page.getByRole("button", { name: "Enregistrer l’exercice" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Rechercher", { exact: true }).fill(name);
  const item = page.locator(".sport-exercise").filter({ hasText: name });
  await expect(item).toContainText("Charge et distance");
  await item.getByRole("button", { name: "Modifier", exact: true }).click();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Deux haltères additionnés");
  await page.getByRole("button", { name: "Enregistrer l’exercice" }).click();
  await expect(item).toContainText("Deux haltères additionnés");
  await item.getByRole("button", { name: "Archiver" }).click();
  await expect(item).toHaveCount(0);
  await page.getByLabel("Afficher", { exact: true }).selectOption("true");
  await page
    .locator(".sport-exercise")
    .filter({ hasText: name })
    .getByRole("button", { name: "Restaurer" })
    .click();
  const w = await createApiWorkout(page, `Séance mobile ${Date.now()}`);
  await page.goto("/sport");
  await page
    .locator(".sport-workout")
    .filter({ hasText: w.name })
    .getByRole("button", { name: /Lancer/ })
    .click();
  await page.locator(".sport-set").click();
  await page.getByLabel("Répétitions (rép.)").fill("12");
  await page.route("**/api/v1/sport/sessions/*/sets/0/0", (route) =>
    route.abort("failed"),
  );
  await page
    .getByRole("button", { name: "Valider la série", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Connexion interrompue");
  expect(
    (await (await page.request.get("/api/v1/sport/sessions/active")).json())
      .sets,
  ).toHaveLength(0);
  await page.unroute("**/api/v1/sport/sessions/*/sets/0/0");
  await page
    .getByRole("button", { name: "Valider la série", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`sport-mobile-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ouvrir la navigation" }),
  ).toBeFocused();
  await tab(page, "Réglages");
  await page
    .getByLabel("Temps de repos entre les séries (secondes)")
    .fill("30");
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(page.getByRole("status")).toHaveText("Réglages enregistrés.");
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await tab(page, "Entraînement");
  await page
    .getByRole("button", { name: "Abandonner l’entraînement", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmer l’abandon" }).click();
  await expect(
    page.getByRole("heading", { name: "Historique", exact: true }),
  ).toBeVisible();
});

test("Sport : réponse obsolète, déconnexion et erreur de chargement", async ({
  page,
}) => {
  await page.route("**/api/v1/sport/exercises?**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Indisponible" } }),
  );
  await page.goto("/sport?tab=exercises");
  await expect(page.getByRole("alert")).toContainText(
    "momentanément indisponible",
  );
  await page.unroute("**/api/v1/sport/exercises?**");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.locator(".sport-exercise").first()).toBeVisible();
  let release!: () => void;
  let reached!: () => void;
  const ready = new Promise<void>((resolve) => (reached = resolve));
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/v1/sport/exercises?**", async (route) => {
    const response = await route.fetch();
    reached();
    await pending;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByLabel("Rechercher", { exact: true }).fill("course");
  await ready;
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(
    page.getByRole("heading", { name: "Connexion", exact: true }),
  ).toBeVisible();
  release();
  await expect(page.locator(".sport-exercise")).toHaveCount(0);
  await expect(page.locator(".sport-sidebar")).toHaveCount(0);
});
