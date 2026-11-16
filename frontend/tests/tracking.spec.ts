import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { Tracker } from "../src/apps/tracking/types";

let auth: BrowserContext;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let headers: Record<string, string>;
let tracker: Tracker;
const stamp = Date.now();
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
}).format(new Date());
const date = (offset: number) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
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
  for (const id of ["tracking", "tasks", "sport"])
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
  for (const t of await (
    await auth.request.get("/api/v1/tracking/trackers")
  ).json())
    expect(
      (
        await auth.request.put(`/api/v1/tracking/trackers/${t.id}/archive`, {
          headers,
          data: { archived: true, expected_version: t.version },
        })
      ).ok(),
    ).toBeTruthy();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
});
test.afterAll(async () => {
  await auth?.close();
});
async function tab(page: Page, name: string) {
  if (await page.locator(".tracking-sidebar").isVisible())
    await page
      .locator(".tracking-sidebar")
      .getByRole("button", { name, exact: true })
      .click();
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
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}

test("Suivi : bibliothèque, configuration et saisie zéro/Non par interface", async ({
  page,
}) => {
  await page.request.put("/api/v1/applications/tracking", {
    headers,
    data: { enabled: false },
  });
  await page.goto("/applications");
  const toggle = page.getByRole("switch", {
    name: "Activer Suivi",
    exact: true,
  });
  await expect(toggle).not.toBeChecked();
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  await page.goto("/tracking");
  await expect(
    page.getByText("Chaque habitude commence par un premier pas."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Créer un suivi", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Nom du suivi", { exact: true })
    .fill(`Mon équilibre ${stamp}`);
  await page.getByLabel("Premier jour", { exact: true }).fill(date(-20));
  await page.getByLabel("Nom de la donnée", { exact: true }).fill("Eau bue");
  await page.getByLabel("Unité", { exact: true }).fill("L");
  await page.getByLabel("Définir un objectif", { exact: true }).check();
  await page.getByLabel("Objectif (L)", { exact: true }).fill("2");
  await page
    .getByLabel("Écart à l’objectif qui donne 0/10", { exact: true })
    .fill("2");
  await page
    .getByRole("button", { name: "Ajouter une donnée", exact: true })
    .click();
  await page
    .getByLabel("Nom de la donnée", { exact: true })
    .fill("Prendre l’air");
  await page.getByRole("button", { name: "Oui / Non", exact: true }).click();
  await page.getByLabel("Définir un objectif", { exact: true }).check();
  const weekdays = [
    "Lundi",
    "Mardi",
    "Mercredi",
    "Jeudi",
    "Vendredi",
    "Samedi",
    "Dimanche",
  ];
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  for (let i = 0; i < weekdays.length; i++)
    if (i !== weekday)
      await page.getByLabel(weekdays[i], { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Enregistrer le suivi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mes suivis", exact: true }),
  ).toBeVisible();
  tracker = (
    await (await page.request.get("/api/v1/tracking/trackers")).json()
  ).find((t: Tracker) => t.name === `Mon équilibre ${stamp}`);
  expect(tracker.fields[1].weekdays).toEqual([weekday]);
  await tab(page, "Aujourd’hui");
  await page
    .getByRole("button", { name: "Commencer", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: `Mon équilibre ${stamp}` });
  await dialog
    .getByRole("spinbutton", { name: "Eau bue", exact: true })
    .fill("0");
  await dialog
    .getByRole("button", { name: "Enregistrer et continuer", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Non", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Terminer le suivi", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const saved = await (
    await page.request.get(
      `/api/v1/tracking/trackers/${tracker.id}/entries/${today}`,
    )
  ).json();
  expect(saved.entry.score).toBe(0);
  expect(saved.entry.status).toBe("complete");
  expect(saved.entry.values[tracker.fields[1].id]).toBe(false);
});

test("Suivi : calendrier contrasté, mois/année, mobile, clavier et période longue", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (let offset = -15; offset < 0; offset++) {
    if (offset % 5 === 0) continue;
    const d = date(offset),
      weekday = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
    const values: Record<string, number | boolean> = {
      [tracker.fields[0].id]: offset === -1 ? 2 : (Math.abs(offset) % 5) / 2,
    };
    if (tracker.fields[1].weekdays.includes(weekday))
      values[tracker.fields[1].id] = true;
    expect(
      (
        await page.request.put(
          `/api/v1/tracking/trackers/${tracker.id}/entries/${d}`,
          {
            headers,
            data: { expected_version: 0, values, complete: offset !== -3 },
          },
        )
      ).ok(),
    ).toBeTruthy();
  }
  const weekly = await page.request.post("/api/v1/tracking/trackers", {
    headers,
    data: {
      name: `Mes lectures ${stamp}`,
      frequency: "weekly",
      start_date: today,
      fields: [
        {
          id: "reading",
          label: "Pages lues",
          goal: { target: 50, tolerance: 50 },
        },
      ],
    },
  });
  expect(weekly.ok()).toBeTruthy();
  await page.goto("/tracking?tab=calendar");
  await expect(
    page.getByRole("heading", { name: "Calendrier", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Mes suivis", exact: true }).selectOption(tracker.id);
  const zero = page.getByRole("button", {
    name: new RegExp("Tout renseigné · score 0/10$"),
  });
  const perfect = page
    .getByRole("button", { name: new RegExp("Tout renseigné · score 10/10$") })
    .last();
  await expect(zero).toBeVisible();
  await expect(perfect).toBeVisible();
  const color = async (l: typeof zero) =>
    l.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await color(zero)).not.toBe(await color(perfect));
  await zero.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(perfect).toBeFocused();
  await page.screenshot({
    path: info.outputPath("tracking-calendar-desktop.png"),
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow(page);
    await expect(zero).toBeVisible();
    const score = zero.locator(".tracking-day-value");
    expect(
      await score.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBeTruthy();
    await page.screenshot({
      path: info.outputPath(`tracking-calendar-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("combobox", { name: "Mes suivis", exact: true }).selectOption("");
  await expect(page.getByText("Les objectifs au long cours", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Année", exact: true }).click();
  await expect(page.locator(".tracking-mini-month")).toHaveCount(12);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("tracking-year-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("Suivi : correction mobile, brouillon, erreur récupérable et historique", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tracking");
  await page
    .getByRole("button", { name: "Revoir la saisie", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: `Mon équilibre ${stamp}` });
  await dialog
    .getByRole("spinbutton", { name: "Eau bue", exact: true })
    .fill("2");
  await page.route(
    `**/tracking/trackers/${tracker.id}/entries/${today}`,
    async (route) => {
      if (route.request().method() === "PUT")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Erreur de recette" }),
        });
      else await route.continue();
    },
  );
  await dialog
    .getByRole("button", { name: "Enregistrer et continuer", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByRole("spinbutton", { name: "Eau bue", exact: true }),
  ).toHaveValue("2");
  await page.unroute(`**/tracking/trackers/${tracker.id}/entries/${today}`);
  await dialog
    .getByRole("button", { name: "Enregistrer et continuer", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Oui", exact: true }).click();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("tracking-entry-mobile.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Terminer le suivi", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const entry = await (
    await page.request.get(
      `/api/v1/tracking/trackers/${tracker.id}/entries/${today}`,
    )
  ).json();
  expect(entry.entry.score).toBe(10);
  const history = await (
    await page.request.get(
      `/api/v1/tracking/trackers/${tracker.id}/entries/${today}/history`,
    )
  ).json();
  expect(history.length).toBeGreaterThan(2);
  expect(history.at(-1).snapshot.values[tracker.fields[0].id]).toBe(0);
  await tab(page, "Réglages");
  await page
    .getByRole("button", { name: "Enregistrer les réglages", exact: true })
    .click();
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
});

test("Suivi : choisir une mesure filtrée, aperçu, sauvegarde et source désactivée", async ({
  page,
}, info) => {
  const spaceResponse = await page.request.post("/api/v1/workspaces", {
    headers,
    data: { name: `Projet suivi ${stamp}` },
  });
  expect(spaceResponse.ok()).toBeTruthy();
  const space = await spaceResponse.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tracking?tab=trackers&edit=new");
  await page
    .getByLabel("Nom du suivi", { exact: true })
    .fill(`Ma progression ${stamp}`);
  await page
    .getByRole("button", { name: "Depuis une application", exact: true })
    .click();
  const picker = page.getByRole("dialog", { name: "Relier une application" });
  await picker.getByRole("button", { name: /^Tâches/ }).click();
  await picker
    .getByRole("searchbox", { name: "Rechercher une mesure" })
    .fill("terminées");
  await picker
    .locator(".tracking-metric-list button")
    .filter({ hasText: "Tâches terminées" })
    .first()
    .click();
  await picker
    .getByLabel("Période de calcul", { exact: true })
    .selectOption("weekly");
  await picker.getByRole("checkbox", { name: "Espace", exact: true }).check();
  await picker
    .getByRole("searchbox", { name: "Rechercher Espace", exact: true })
    .fill(`Projet suivi ${stamp}`);
  await picker
    .getByRole("combobox", { name: "Espace", exact: true })
    .selectOption(space.id);
  await picker
    .getByRole("button", { name: "Calculer l’aperçu", exact: true })
    .click();
  await expect(
    picker.locator(".tracking-source-preview strong"),
  ).not.toHaveText("—");
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("tracking-integration-mobile.png"),
    fullPage: true,
  });
  await picker
    .getByRole("button", { name: "Utiliser cette mesure", exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  await page
    .getByRole("button", { name: "Enregistrer le suivi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mes suivis", exact: true }),
  ).toBeVisible();
  const dynamic: Tracker = (
    await (await page.request.get("/api/v1/tracking/trackers")).json()
  ).find((t: Tracker) => t.name === `Ma progression ${stamp}`);
  expect(dynamic.fields[0].source?.period).toBe("weekly");
  expect(dynamic.fields[0].source?.filters.workspace_id).toBe(space.id);
  expect(
    (
      await page.request.put(
        `/api/v1/tracking/trackers/${dynamic.id}/entries/${today}`,
        { headers, data: { complete: true } },
      )
    ).ok(),
  ).toBeTruthy();
  await page.request.put("/api/v1/applications/tasks", {
    headers,
    data: { enabled: false },
  });
  await page.goto("/tracking");
  await expect(
    page.getByRole("heading", { name: "Aujourd’hui", exact: true }),
  ).toBeVisible();
  const snapshot = await (
    await page.request.get(
      `/api/v1/tracking/trackers/${dynamic.id}/entries/${today}`,
    )
  ).json();
  expect(snapshot.entry.values[dynamic.fields[0].id]).not.toBeNull();
  await page.request.put("/api/v1/applications/tasks", {
    headers,
    data: { enabled: true },
  });
});

test("Suivi : statistiques, récompenses, archives, désactivation et anglais", async ({
  page,
}, info) => {
  await page.goto("/tracking?tab=statistics");
  await page
    .getByRole("combobox", { name: "Mes suivis", exact: true })
    .selectOption(tracker.id);
  await expect(page.locator(".tracking-trend")).toHaveCount(2);
  await page.screenshot({
    path: info.outputPath("tracking-statistics-desktop.png"),
    fullPage: true,
  });
  const exercises = await (
    await page.request.get("/api/v1/sport/exercises?kind=reps&q=burpees")
  ).json();
  const programResponse = await page.request.post("/api/v1/sport/workouts", {
    headers,
    data: {
      name: `Programme suivi ${stamp}`,
      entries: [
        { exercise_id: exercises.items[0].id, sets: 1, target: { reps: 10 } },
      ],
    },
  });
  expect(programResponse.ok()).toBeTruthy();
  const program = await programResponse.json();
  await page
    .getByRole("button", { name: "Explorer une mesure", exact: true })
    .click();
  const picker = page.getByRole("dialog", { name: "Relier une application" });
  await picker.getByRole("button", { name: /^Sport/ }).click();
  await picker
    .getByRole("searchbox", { name: "Rechercher une mesure" })
    .fill("Entraînements terminés");
  await picker.locator(".tracking-metric-list button").first().click();
  await picker
    .getByRole("checkbox", { name: "Programme", exact: true })
    .check();
  await picker
    .getByRole("searchbox", { name: "Rechercher Programme", exact: true })
    .fill(`Programme suivi ${stamp}`);
  await picker
    .getByRole("combobox", { name: "Programme", exact: true })
    .selectOption(program.id);
  await picker
    .getByRole("button", { name: "Utiliser cette mesure", exact: true })
    .click();
  await expect(page.locator(".tracking-activity-value")).toHaveText("0");
  await tab(page, "Réussites");
  await expect(
    page.locator(".tracking-badges .is-earned").first(),
  ).toBeVisible();
  await tab(page, "Mes suivis");
  const card = page
    .locator(".tracking-tracker-list article")
    .filter({ hasText: tracker.name });
  await card
    .getByRole("button", { name: `Archiver ${tracker.name}`, exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Archives", exact: true }).check();
  await card
    .getByRole("button", { name: `Restaurer ${tracker.name}`, exact: true })
    .click();
  const before = await (
    await page.request.get(
      `/api/v1/tracking/trackers/${tracker.id}/entries/${today}`,
    )
  ).json();
  await page.request.put("/api/v1/applications/tracking", {
    headers,
    data: { enabled: false },
  });
  await page.goto("/tracking");
  await expect(page.locator(".tracking-shell")).toHaveCount(0);
  expect((await page.request.get("/api/v1/tracking/current")).status()).toBe(
    403,
  );
  await page.request.put("/api/v1/applications/tracking", {
    headers,
    data: { enabled: true },
  });
  expect(
    await (
      await page.request.get(
        `/api/v1/tracking/trackers/${tracker.id}/entries/${today}`,
      )
    ).json(),
  ).toEqual(before);
  await page.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "en", theme: "dark" },
  });
  await page.goto("/tracking?tab=calendar");
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("tracking-calendar-dark-en.png"),
    fullPage: true,
  });
  await page.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
});
