import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type {
  ExercisePage,
  KindDefinition,
  Training,
  Workout,
} from "../src/apps/sport/types";

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
  const opener = page.getByRole("button", {
    name: "Ouvrir la navigation",
    exact: true,
  });
  if (
    (await opener.isVisible()) &&
    (await opener.getAttribute("aria-expanded")) === "false"
  )
    await opener.click();
  await page
    .locator(".application-sidebar")
    .getByRole("button", { name, exact: true })
    .click();
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

test("Sport : ouvrir la navigation mobile sans activer le thème", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sport");
  await expect(
    page.getByRole("heading", { name: "Programmes", exact: true }),
  ).toBeVisible();
  const opener = page.getByRole("button", {
    name: "Ouvrir la navigation",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Navigation Sport" });
  const close = dialog.getByRole("button", {
    name: "Fermer la navigation",
    exact: true,
  });
  const theme = dialog.getByRole("combobox", { name: "Apparence" });
  for (const method of ["pointer", "keyboard"] as const) {
    await opener.focus();
    if (method === "pointer") await opener.click();
    else await page.keyboard.press("Enter");
    await expect(close).toBeFocused();
    await expect(theme).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Programmes", exact: true }),
    ).toBeFocused();
    if (method === "pointer") await close.click();
    else await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
  await opener.click();
  const previousTheme = await theme.inputValue();
  await theme.selectOption(previousTheme === "dark" ? "light" : "dark");
  await expect(theme).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    previousTheme === "dark" ? "light" : "dark",
  );
  await theme.selectOption(previousTheme);
  await expect(theme).toBeEnabled();
  await close.click();
  await opener.click();
  await expect(close).toBeFocused();
  await dialog.getByRole("button", { name: "Exercices", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Exercices", exact: true }),
  ).toBeFocused();
});

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
    page.getByRole("heading", { name: "Programmes", exact: true }),
  ).toBeVisible();
  await tab(page, "Réglages");
  await page
    .getByLabel("Temps de repos entre les séries (secondes)")
    .fill("120");
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(page.locator(".sport-settings").getByRole("status")).toHaveText(
    "Réglages enregistrés.",
  );
  await tab(page, "Programmes");
  await page
    .getByRole("button", { name: "Nouveau programme", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const dialog = page.getByRole("form", { name: "Nouveau programme" });
  const name = `Séance mixte ${Date.now()}`;
  await dialog.getByLabel("Nom du programme").fill(name);
  for (const [i, [query, kind]] of [
    ["Développé couché à la barre", "weight_reps"],
    ["Course sur tapis", "distance_duration"],
    ["Marche du fermier", "weight_distance"],
    ["Burpees", "reps"],
  ].entries()) {
    await dialog
      .getByRole("button", { name: "Ajouter un exercice", exact: true })
      .click();
    const picker = dialog.locator(".sport-picker");
    await picker.getByLabel("Rechercher un exercice").fill(query);
    await picker
      .getByRole("combobox", { name: "Type", exact: true })
      .selectOption(kind);
    await expect(picker.getByRole("status")).toHaveCount(0);
    await picker
      .locator(".sport-picker-item")
      .filter({ hasText: query })
      .first()
      .click();
    await dialog.getByLabel("Nombre de séries").nth(i).fill("1");
  }
  await dialog
    .getByRole("button", { name: "Enregistrer le programme" })
    .click();
  await expect(dialog).toHaveCount(0);
  const card = page
    .locator(".sport-workout")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: /Démarrer l’entraînement/ }).click();
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
    const row = page
      .locator(".sport-session-exercise")
      .nth(i)
      .locator(".sport-set");
    for (const [label, value] of Object.entries(values[i]))
      await row.getByLabel(label, { exact: true }).fill(value!);
    await row
      .getByRole("button", { name: "Valider la série", exact: true })
      .click();
    await expect(row).toHaveClass(/is-complete/);
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
    .locator(".application-sidebar")
    .getByRole("link", { name: "Bibliothèque des applications" })
    .click();
  await page
    .getByRole("switch", { name: "Activer Sport", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Activer Sport", exact: true }),
  ).not.toBeChecked();
  expect((await page.request.get("/api/v1/sport/sessions")).status()).toBe(403);
  await page.goto("/sport");
  await expect(
    page.getByRole("heading", { name: "Sport est désactivée" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ouvrir la bibliothèque" }).click();
  await page
    .getByRole("switch", { name: "Activer Sport", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Activer Sport", exact: true }),
  ).toBeChecked();
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
    .getByRole("button", { name: /Démarrer l’entraînement/ })
    .click();
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
  await expect(page.locator(".sport-settings").getByRole("status")).toHaveText(
    "Réglages enregistrés.",
  );
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

async function weightedTraining(page: Page, sets: number) {
  const catalogue: ExercisePage = await (
    await page.request.get("/api/v1/sport/exercises?kind=weight_reps&limit=1")
  ).json();
  const response = await page.request.post("/api/v1/sport/workouts", {
    headers,
    data: {
      name: `Séries directes ${Date.now()}`,
      entries: [
        {
          exercise_id: catalogue.items[0].id,
          sets,
          target: { weight_kg: 20, reps: 10 },
        },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();
  const workout: Workout = await response.json();
  const started = await page.request.post("/api/v1/sport/sessions", {
    headers,
    data: { workout_id: workout.id, expected_version: workout.version },
  });
  expect(started.ok()).toBeTruthy();
  return { workout, training: (await started.json()) as Training };
}

test("Sport : saisie directe, brouillons, conflit, correction et séance suivante", async ({
  page,
}) => {
  const { workout, training } = await weightedTraining(page, 2);
  await page.goto("/sport?tab=training");
  const first = page.locator(".sport-set").nth(0);
  const second = page.locator(".sport-set").nth(1);
  const weight = (row: typeof first) => row.getByLabel("Charge totale (kg)");
  const reps = (row: typeof first) => row.getByLabel("Répétitions (rép.)");
  await expect(weight(first)).toHaveValue("20");
  await expect(weight(second)).toHaveValue("20");
  await expect(
    page.getByRole("button", { name: "Actualiser l’entraînement" }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await weight(second).fill("42.5");
  await reps(second).fill("8");
  await weight(first).fill("40");
  // Native validation remains available; neither invalid nor empty sets are saved.
  await reps(first).fill("");
  await first
    .getByRole("button", { name: "Valider la série", exact: true })
    .click();
  await expect(first).not.toHaveClass(/is-complete/);
  await reps(first).fill("12");
  await reps(first).press("Enter");
  await expect(first).toHaveClass(/is-complete/);
  await expect(weight(second)).toHaveValue("42.5");
  await expect(reps(second)).toHaveValue("8");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(first.locator(".sport-set-number")).toHaveCSS(
    "text-decoration-line",
    "none",
  );
  const saved: Training = await (
    await page.request.get(`/api/v1/sport/sessions/${training.id}`)
  ).json();
  // A direct API edit on another device produces a real optimistic-lock conflict.
  expect(
    (
      await page.request.put(`/api/v1/sport/sessions/${training.id}/sets/0/0`, {
        headers,
        data: {
          expected_version: saved.version,
          values: { weight_kg: 41, reps: 12 },
        },
      })
    ).ok(),
  ).toBeTruthy();
  await second
    .getByRole("button", { name: "Valider la série", exact: true })
    .click();
  await expect(second.getByRole("alert")).toContainText("a changé");
  await expect(weight(second)).toHaveValue("42.5");
  await page.getByRole("button", { name: "Actualiser l’entraînement" }).click();
  await expect(weight(first)).toHaveValue("41");
  await expect(weight(second)).toHaveValue("42.5");
  let release!: () => void;
  let captured!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  const ready = new Promise<void>((resolve) => (captured = resolve));
  await page.route("**/api/v1/sport/sessions/active", async (route) => {
    const response = await route.fetch();
    captured();
    await pending;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Actualiser l’entraînement" }).click();
  await ready;
  await second
    .getByRole("button", { name: "Valider la série", exact: true })
    .click();
  await expect(second).toHaveClass(/is-complete/);
  await expect(
    page.getByRole("button", { name: "Actualiser l’entraînement" }),
  ).toHaveCount(0);
  release();
  await expect(page.getByText("Chargement…", { exact: true })).toHaveCount(0);
  await expect(page.locator(".sport-set.is-complete")).toHaveCount(2);
  await page.unroute("**/api/v1/sport/sessions/active");
  const before: Training = await (
    await page.request.get(`/api/v1/sport/sessions/${training.id}`)
  ).json();
  await weight(first).fill("45");
  await expect(
    page.getByRole("button", { name: "Terminer l’entraînement", exact: true }),
  ).toBeDisabled();
  await first.getByRole("button", { name: "Corriger la série" }).click();
  await expect(first.getByText("Validée", { exact: true })).toBeVisible();
  const corrected: Training = await (
    await page.request.get(`/api/v1/sport/sessions/${training.id}`)
  ).json();
  expect(corrected.sets[0].values.weight_kg).toBe(45);
  expect(corrected.sets[0].completed_at).toBe(before.sets[0].completed_at);
  expect(corrected.rest_until).toBe(before.rest_until);
  await second.getByRole("button", { name: "Annuler la validation" }).click();
  await expect(second).not.toHaveClass(/is-complete/);
  await expect(weight(second)).toHaveValue("42.5");
  await expect(page.getByRole("timer")).toHaveText("00:00");
  await second
    .getByRole("button", { name: "Valider la série", exact: true })
    .click();
  await expect(second).toHaveClass(/is-complete/);
  await page.reload();
  await expect(weight(first)).toHaveValue("45");
  await expect(reps(second)).toHaveValue("8");
  await page
    .getByRole("button", { name: "Terminer l’entraînement", exact: true })
    .click();
  await page.getByRole("button", { name: "Enregistrer les résultats" }).click();
  await expect(
    page.getByRole("heading", { name: "Historique", exact: true }),
  ).toBeVisible();
  await tab(page, "Programmes");
  await page
    .locator(".sport-workout")
    .filter({ hasText: workout.name })
    .getByRole("button", { name: /Démarrer/ })
    .click();
  await expect(weight(first)).toHaveValue("45");
  await expect(reps(first)).toHaveValue("12");
  await expect(weight(second)).toHaveValue("42.5");
  await expect(reps(second)).toHaveValue("8");
  await expect(page.locator(".sport-set.is-complete")).toHaveCount(0);
  await expect(page.getByRole("timer")).toHaveText("00:00");
  const next: Training = await (
    await page.request.get("/api/v1/sport/sessions/active")
  ).json();
  expect(next.sets).toEqual([]);
  expect(next.entries[0].suggested_values.map((v) => v?.weight_kg)).toEqual([
    45, 42.5,
  ]);
  await page.reload();
  await expect(weight(second)).toHaveValue("42.5");
  await first
    .getByRole("button", { name: "Valider la série", exact: true })
    .click();
  await expect(first).toHaveClass(/is-complete/);
  await tab(page, "Exercices");
  await expect(page.getByRole("timer")).toBeInViewport();
  await expect(page.getByRole("timer")).not.toHaveText("00:00");
  await page.getByRole("button", { name: "Passer le repos" }).click();
  await expect(page.getByRole("timer")).toHaveText("00:00");
  await tab(page, "Entraînement");
  await expect(first).toHaveClass(/is-complete/);
  expect(
    (await (await page.request.get("/api/v1/sport/sessions/active")).json())
      .rest_until,
  ).toBeNull();
});

test("Sport : récupération fixée en bas, défilement, thèmes et clavier mobile", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const { training } = await weightedTraining(page, 12);
  await page.request.put("/api/v1/sport/settings", {
    headers,
    data: { rest_seconds: 120 },
  });
  const recorded = await page.request.put(
    `/api/v1/sport/sessions/${training.id}/sets/0/0`,
    {
      headers,
      data: {
        expected_version: training.version,
        values: { weight_kg: 30, reps: 12 },
      },
    },
  );
  expect(recorded.ok()).toBeTruthy();
  for (const width of [320, 375, 1440]) {
    const mobile = width < 800;
    const context = await browser.newContext({
      baseURL: process.env.LIFE_E2E_URL ?? "http://127.0.0.1:18106",
      viewport: { width, height: 850 },
      hasTouch: mobile,
      isMobile: mobile,
    });
    await context.addCookies(cookies);
    const screen = await context.newPage();
    if (mobile)
      await screen.addInitScript(() => {
        const viewport = Object.assign(new EventTarget(), {
          height: 850,
          offsetTop: 0,
          scale: 1,
        });
        Object.defineProperty(window, "visualViewport", {
          configurable: true,
          value: viewport,
        });
        window.addEventListener("test-viewport", (event) => {
          Object.assign(viewport, (event as CustomEvent).detail);
          viewport.dispatchEvent(new Event("resize"));
        });
      });
    await screen.goto("/sport?tab=training");
    const bar = screen.locator(".sport-rest");
    const assertBar = async (bottom = 850) => {
      await expect(bar).toHaveCSS("position", "fixed");
      await expect
        .poll(async () =>
          Math.abs(
            (await bar.boundingBox())!.y +
              (await bar.boundingBox())!.height -
              bottom,
          ),
        )
        .toBeLessThan(2);
      expect((await bar.boundingBox())!.y).toBeGreaterThan(0);
      await expect(screen.getByRole("timer")).toBeInViewport();
      const skip = screen.getByRole("button", { name: "Passer le repos" });
      if (await skip.isVisible()) {
        const time = (await screen.getByRole("timer").boundingBox())!;
        expect(time.x + time.width).toBeLessThanOrEqual(
          (await skip.boundingBox())!.x - 6,
        );
      }
    };
    for (const theme of ["light", "dark"]) {
      // Change only the rendering theme; persistence is covered by the existing theme journey.
      await screen.evaluate(
        (value) => (document.documentElement.dataset.theme = value),
        theme,
      );
      await assertBar();
      await screen.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const shell = document.querySelector(".sport-shell")!;
        shell.scrollTop = shell.scrollHeight;
      });
      await assertBar();
      const last = screen.getByRole("button", {
        name: "Terminer l’entraînement",
        exact: true,
      });
      await expect(last).toBeInViewport();
      expect(
        (await last.boundingBox())!.y + (await last.boundingBox())!.height,
      ).toBeLessThan((await bar.boundingBox())!.y);
      expect(
        await screen.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await screen.screenshot({
        path: testInfo.outputPath(`sport-series-${width}-${theme}.png`),
      });
    }
    if (mobile) {
      const field = screen
        .locator(".sport-set")
        .last()
        .getByLabel("Charge totale (kg)");
      await field.focus();
      await screen.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent("test-viewport", { detail: { height: 430 } }),
        ),
      );
      await field.fill("32.5");
      await assertBar(430);
      await expect(field).toHaveCSS("font-size", "16px");
      await expect
        .poll(
          async () =>
            (await field.boundingBox())!.y +
              (await field.boundingBox())!.height <
            (await bar.boundingBox())!.y,
        )
        .toBe(true);
      await expect(field).toHaveValue("32.5");
    }
    await context.close();
  }
});

test("Sport : blocs d’exercice et lignes de séries compactes pour les dix types", async ({
  page,
}, testInfo) => {
  const kinds: KindDefinition[] = await (
    await page.request.get("/api/v1/sport/kinds")
  ).json();
  expect(kinds).toHaveLength(10);
  const entries = [];
  for (const [i, kind] of kinds.entries()) {
    const created = await page.request.post("/api/v1/sport/exercises", {
      headers,
      data: {
        name:
          i === 0
            ? "Développé avec haltères sur banc incliné — amplitude complète et mouvement contrôlé"
            : `Exercice compact ${kind.name}`,
        kind: kind.id,
      },
    });
    expect(created.ok()).toBeTruthy();
    entries.push({
      exercise_id: (await created.json()).id as string,
      sets: 2,
      target: Object.fromEntries(kind.fields.map((field) => [field.key, 12])),
    });
  }
  const created = await page.request.post("/api/v1/sport/workouts", {
    headers,
    data: { name: "Dix types en lignes compactes", entries },
  });
  expect(created.ok()).toBeTruthy();
  const workout: Workout = await created.json();
  const started = await page.request.post("/api/v1/sport/sessions", {
    headers,
    data: { workout_id: workout.id, expected_version: workout.version },
  });
  expect(started.ok()).toBeTruthy();
  await page.goto("/sport?tab=training");
  await expect(page.locator(".sport-session-exercise")).toHaveCount(10);
  const first = page.getByRole("form", {
    name: `${workout.entries[0].name}, série 1`,
    exact: true,
  });
  await first
    .getByRole("button", { name: "Valider la série", exact: true })
    .click();
  await expect(first.getByText("Validée", { exact: true })).toBeVisible();
  await first.getByRole("spinbutton").first().fill("15");
  await expect(first.getByText("Saisie à enregistrer")).toBeVisible();

  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) => (document.documentElement.dataset.theme = value),
        theme,
      );
      for (const [i, entry] of workout.entries.entries()) {
        const card = page.getByRole("region", {
          name: entry.name,
          exact: true,
        });
        await expect(
          card.getByRole("heading", { name: entry.name, exact: true }),
        ).toBeVisible();
        await expect(card.getByRole("form")).toHaveCount(2);
        const geometry = await card.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const heading = element.querySelector("h2")!.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            border: parseFloat(style.borderTopWidth),
            titleInside: heading.top >= box.top && heading.bottom <= box.bottom,
            rows: Array.from(element.querySelectorAll("form")).map((form) => {
              const controls = Array.from(
                form.querySelectorAll("input, .sport-set-row > button"),
              );
              const rects = controls.map((control) =>
                control.getBoundingClientRect(),
              );
              return {
                aligned: rects.every(
                  (rect) => Math.abs(rect.bottom - rects[0].bottom) < 2,
                ),
                inside: rects.every(
                  (rect) => rect.left >= box.left && rect.right <= box.right,
                ),
                separate: rects.every(
                  (rect, index) =>
                    !index || rect.left >= rects[index - 1].right + 4,
                ),
                touch: rects.every(
                  (rect) => rect.height >= 44 && rect.width >= 44,
                ),
                height: form.getBoundingClientRect().height,
              };
            }),
          };
        });
        expect(geometry.border).toBeGreaterThan(0);
        expect(geometry.titleInside).toBe(true);
        for (const row of geometry.rows) {
          expect(row.aligned).toBe(true);
          expect(row.inside).toBe(true);
          expect(row.separate).toBe(true);
          expect(row.touch).toBe(true);
        }
        // An untouched series remains compact, including its labels and status.
        expect(geometry.rows[1].height).toBeLessThan(110);
        for (const field of kinds[i].fields)
          await expect(
            card.getByLabel(`${field.label} (${field.unit})`, { exact: true }),
          ).toHaveCount(2);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath(`sport-compact-${width}-${theme}.png`),
      });
    }
  }
  await page.setViewportSize({ width: 320, height: 1000 });
  const fields = first.getByRole("spinbutton");
  await fields.last().focus();
  await page.keyboard.press("Tab");
  await expect(
    first.getByRole("button", { name: "Corriger la série" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(first.getByText("Validée", { exact: true })).toBeVisible();
  const saved: Training = await (
    await page.request.get("/api/v1/sport/sessions/active")
  ).json();
  expect(saved.sets[0].values[kinds[0].fields[0].key]).toBe(15);
  await page.reload();
  await expect(first.getByRole("spinbutton").first()).toHaveValue("15");
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
  await expect(page.locator(".application-sidebar")).toHaveCount(0);
});
