import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type {
  Exercise,
  Measurement,
  SportSettings,
  Training,
  Workout,
} from "../src/apps/sport/types";

let auth: BrowserContext;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let headers: Record<string, string>;
test.beforeAll(async ({ browser }) => {
  auth = await browser.newContext({
    baseURL: process.env.LIFE_E2E_URL ?? "http://127.0.0.1:18106",
  });
  const response = await auth.request.post("/api/v1/auth/session", {
    data: {
      username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
      password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
    },
  });
  expect(response.ok()).toBeTruthy();
  headers = { "X-CSRF-Token": (await response.json()).csrf_token };
  cookies = await auth.cookies();
});
test.afterAll(async () => {
  await auth?.close();
});
async function read<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1${path}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function write<T>(
  page: Page,
  path: string,
  data: unknown,
  method = "PUT",
): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    headers,
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function program(page: Page, name = `UX ${Date.now()}`, sets = 2) {
  const catalogue = await read<{ items: Exercise[] }>(
    page,
    "/sport/exercises?q=développé%20couché%20barre&kind=weight_reps",
  );
  return write<Workout>(
    page,
    "/sport/workouts",
    {
      name,
      notes: "Préparer le tapis et les haltères.",
      entries: [
        {
          exercise_id: catalogue.items[0].id,
          sets,
          target: { weight_kg: 40, reps: 10 },
        },
      ],
    },
    "POST",
  );
}
async function tab(page: Page, name: string) {
  const opener = page.getByRole("button", {
    name: "Ouvrir la navigation",
    exact: true,
  });
  if (await opener.isVisible()) await opener.click();
  await page
    .locator(".application-sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
  await write(page, "/applications/sport", { enabled: true });
  await write(page, "/preferences", { locale: "fr", theme: "light" });
  const active = await read<Training | null>(page, "/sport/sessions/active");
  if (active)
    await write(page, `/sport/sessions/${active.id}/finish`, {
      expected_version: active.version,
      outcome: "cancelled",
    });
  await write(page, "/sport/settings", {
    rest_seconds: 90,
    workouts_view: "grid",
    workouts_mobile_view: "list",
    exercises_view: "list",
    exercises_mobile_view: "list",
    measurements_view: "grid",
    measurements_mobile_view: "list",
  });
});

test("Sport UX : liste/grille, filtres, duplication et annulation d’archive persistants", async ({
  page,
}) => {
  const source = await program(page);
  await page.goto("/sport");
  await page.getByLabel("Rechercher un programme").fill(source.name);
  const cards = page.locator(".sport-workout");
  await expect(cards).toHaveCount(1);
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.locator(".sport-workout-grid")).toHaveAttribute(
    "data-view",
    "list",
  );
  expect(
    (await read<SportSettings>(page, "/sport/settings")).rest_seconds,
  ).toBe(90);
  await tab(page, "Historique");
  await tab(page, "Programmes");
  await expect(page.getByLabel("Rechercher un programme")).toHaveValue(
    source.name,
  );
  await expect(cards).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole("button", { name: "Grille", exact: true }).click();
  await expect(page.locator(".sport-workout-grid")).toHaveAttribute(
    "data-view",
    "grid",
  );
  await page.reload();
  await expect(page.locator(".sport-workout-grid")).toHaveAttribute(
    "data-view",
    "grid",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".sport-workout-grid")).toHaveAttribute(
    "data-view",
    "list",
  );
  const settings = await read<SportSettings>(page, "/sport/settings");
  expect(settings.workouts_view).toBe("list");
  expect(settings.workouts_mobile_view).toBe("grid");
  await cards.getByRole("button", { name: /Dupliquer/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom du programme").fill(`${source.name} copie`);
  await dialog
    .getByRole("button", { name: "Dupliquer le programme", exact: true })
    .click();
  await expect(cards).toHaveCount(2);
  const copy = cards.filter({ hasText: `${source.name} copie` });
  await copy.getByRole("button", { name: /Archiver/ }).click();
  await expect(cards).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Annuler l’archivage" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Annuler l’archivage" }).click();
  await expect(cards).toHaveCount(2);
  const saved = (
    await read<Workout[]>(
      page,
      `/sport/workouts?q=${encodeURIComponent(source.name)}`,
    )
  ).find((item) => item.name.endsWith("copie"))!;
  expect(saved.entries).toEqual(source.entries);
  expect(saved.last_used_at).toBeNull();
});

test("Sport UX : recherche temporisée, liste stable et retour à la position", async ({
  page,
}) => {
  await page.goto("/sport?tab=exercises");
  const rows = page.locator(".sport-exercise");
  await expect(rows).toHaveCount(40);
  const requests: string[] = [];
  let release!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/sport/exercises?**", async (route) => {
    requests.push(route.request().url());
    const response = await route.fetch();
    await responseGate;
    await route.fulfill({ response });
  });
  await page.getByRole("searchbox").pressSequentially("squat", { delay: 60 });
  await expect.poll(() => requests.length).toBe(1);
  await expect(rows).toHaveCount(40);
  release();
  await expect(rows.first()).toContainText(/squat/i);
  await page.unroute("**/api/v1/sport/exercises?**");
  await page.getByLabel("Type d’exercice").selectOption("weight_reps");
  await expect(page).toHaveURL(/ex_kind=weight_reps/);
  await rows.last().scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  expect(scroll).toBeGreaterThan(100);
  await tab(page, "Statistiques");
  await tab(page, "Exercices");
  await expect(page.getByRole("searchbox")).toHaveValue("squat");
  await expect(page.getByLabel("Type d’exercice")).toHaveValue("weight_reps");
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(scroll - 80);
  await page.reload();
  await expect(page.getByRole("searchbox")).toHaveValue("squat");
});

test("Sport UX : brouillon, validation locale et fermeture pendant la sauvegarde", async ({
  page,
}) => {
  await page.goto("/sport?tab=exercises");
  await page
    .getByRole("button", { name: "Nouvel exercice", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const name = `Personnel UX ${Date.now()}`;
  await dialog.getByLabel("Nom de l’exercice").fill("   ");
  await dialog.getByRole("button", { name: "Enregistrer l’exercice" }).click();
  await expect(dialog.getByLabel("Nom de l’exercice")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dialog.getByLabel("Nom de l’exercice")).toBeFocused();
  await dialog.getByLabel("Nom de l’exercice").fill(name);
  page.once("dialog", (modal) => modal.dismiss());
  await page.keyboard.press("Escape");
  await expect(dialog.getByLabel("Nom de l’exercice")).toHaveValue(name);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/v1/sport/exercises", async (route) => {
    requests += 1;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  await dialog.getByRole("button", { name: "Enregistrer l’exercice" }).click();
  await expect(dialog.locator("form")).toHaveAttribute("aria-busy", "true");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Afficher", { exact: true }).selectOption("personal");
  await page.getByRole("searchbox").fill(name);
  await expect(page.locator(".sport-exercise")).toHaveCount(1);
  expect(requests).toBe(1);
  await tab(page, "Réglages");
  const rest = page.locator('input[name="rest_seconds"]');
  await rest.fill("");
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(rest).toHaveValue("");
  await expect(rest).toHaveAttribute("aria-invalid", "true");
  expect(
    (await read<SportSettings>(page, "/sport/settings")).rest_seconds,
  ).toBe(90);
  await rest.fill("120");
  page.once("dialog", (modal) => modal.dismiss());
  await tab(page, "Programmes");
  await expect(rest).toHaveValue("120");
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(page.getByRole("status")).toContainText(/enregistr/);
  expect(
    (await read<SportSettings>(page, "/sport/settings")).rest_seconds,
  ).toBe(120);
});

test("Sport UX : conflit explicite de programme, comparaison puis copie", async ({
  page,
}) => {
  const source = await program(page);
  await page.goto(`/sport?tab=workouts&program=${source.id}`);
  await page
    .getByLabel("Nom du programme")
    .fill(`${source.name} mon brouillon`);
  const changed = await write<Workout>(page, `/sport/workouts/${source.id}`, {
    ...source,
    id: undefined,
    created_at: undefined,
    updated_at: undefined,
    archived_at: undefined,
    last_used_at: undefined,
    version: undefined,
    entries: source.entries.map(({ exercise_id, sets, target }) => ({
      exercise_id,
      sets,
      target,
    })),
    expected_version: source.version,
    name: `${source.name} distant`,
  });
  await page.getByRole("button", { name: "Enregistrer le programme" }).click();
  await page
    .getByRole("button", { name: "Comparer avec la version enregistrée" })
    .click();
  await expect(page.locator(".sport-comparison")).toContainText(changed.name);
  await expect(page.locator(".sport-comparison")).toContainText(
    "mon brouillon",
  );
  await page
    .getByRole("button", { name: "Enregistrer comme nouvelle copie" })
    .click();
  await page.getByRole("button", { name: "Enregistrer le programme" }).click();
  await expect(
    page.getByRole("heading", { name: "Programmes", exact: true }),
  ).toBeVisible();
  expect((await read<Workout>(page, `/sport/workouts/${source.id}`)).name).toBe(
    changed.name,
  );
  expect(
    (
      await read<Workout[]>(
        page,
        `/sport/workouts?q=${encodeURIComponent(source.name)}`,
      )
    ).some(
      (item) => item.name.includes("mon brouillon") && item.id !== source.id,
    ),
  ).toBeTruthy();
});

test("Sport UX : sélection multiple paginée, filtre personnel et déplacement direct", async ({
  page,
}) => {
  await page.goto("/sport?tab=workouts&program=new");
  await page.getByLabel("Nom du programme").fill(`Multi UX ${Date.now()}`);
  await page
    .getByRole("button", { name: "Ajouter un exercice", exact: true })
    .click();
  const picker = page.locator(".sport-picker");
  await expect(picker.locator(".sport-picker-row")).toHaveCount(20);
  const first = await picker
    .locator(".sport-picker-item strong")
    .first()
    .textContent();
  await picker.getByRole("checkbox").first().check();
  await picker.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(
    picker.getByRole("button", { name: "Suivant", exact: true }),
  ).toBeFocused();
  await expect(
    picker.locator(".sport-picker-item strong").first(),
  ).not.toHaveText(first!);
  await picker.getByRole("checkbox").first().check();
  await picker.getByRole("button", { name: "Ajouter la sélection" }).click();
  await expect(page.getByLabel("Nombre de séries")).toHaveCount(2);
  await expect(picker).toBeVisible();
  await expect(picker.locator(".sport-picker-item").first()).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("button", { name: "Fermer le catalogue" }).click();
  const titles = await page.locator(".sport-plan-entry h3").allTextContents();
  await page
    .getByLabel("Déplacer à la position")
    .first()
    .selectOption({ value: "1" });
  await expect(page.locator(".sport-plan-entry h3").last()).toContainText(
    titles[0].replace(/^1/, "").trim(),
  );
  await page.getByRole("button", { name: "Enregistrer le programme" }).click();
  await expect(
    page.getByRole("heading", { name: "Programmes", exact: true }),
  ).toBeVisible();
});

test("Sport UX : focus de série, brouillon normalisé, repos ajustable et bilan réel", async ({
  page,
}) => {
  const source = await program(page);
  await write(
    page,
    "/sport/sessions",
    { workout_id: source.id, expected_version: source.version },
    "POST",
  );
  await page.goto("/sport?tab=training");
  await page.getByText("Notes de préparation", { exact: true }).click();
  await expect(page.locator(".sport-preparation")).toContainText(source.notes);
  const row = page.locator(".sport-set").first();
  const weight = row.getByLabel("Charge totale (kg)", { exact: true });
  await weight.fill("41");
  await weight.fill("40");
  await expect(
    page.getByRole("button", { name: "Terminer l’entraînement", exact: true }),
  ).toBeEnabled();
  await weight.press("Enter");
  await expect(
    row.getByRole("button", { name: "Corriger la série" }),
  ).toBeVisible();
  await expect(weight).toBeFocused();
  let active = await read<Training>(page, "/sport/sessions/active");
  const before = Date.parse(active.rest_until!);
  await page
    .getByRole("button", { name: "Ajouter 15 secondes de repos" })
    .click();
  await expect
    .poll(async () =>
      Date.parse(
        (await read<Training>(page, "/sport/sessions/active")).rest_until!,
      ),
    )
    .toBe(before + 15000);
  await tab(page, "Exercices");
  await page
    .getByRole("button", { name: "Reprendre la séance", exact: true })
    .click();
  await expect(
    row.getByRole("button", { name: "Corriger la série" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Passer le repos" }).click();
  await expect(page.locator(".sport-rest")).toHaveClass(/is-ready/);
  expect(
    (await page.locator(".sport-rest").boundingBox())!.height,
  ).toBeLessThan(65);
  await page.getByRole("button", { name: /Prochaine série/ }).click();
  await expect(
    page.locator(".sport-set").nth(1).locator("input").first(),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Terminer l’entraînement", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer les résultats" })
    .click();
  await expect(page.locator(".sport-session-summary")).toContainText("+65 XP");
  await expect(page.locator(".sport-session-summary")).toContainText(
    "Progression actuelle",
  );
  active = await read<Training>(page, `/sport/sessions/${active.id}`);
  expect(active.sets.filter((set) => set.skipped)).toHaveLength(1);
  await page
    .getByRole("button", { name: "Voir le détail de la séance" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(source.name);
  await expect(page).toHaveURL(/session=/);
});

test("Sport UX : mensurations rapides, valeurs repliées, écarts neutres et graphique temporel", async ({
  page,
}) => {
  const previous = await read<Measurement[]>(page, "/sport/measurements");
  for (const item of previous)
    await write(page, `/sport/measurements/${item.id}/archive`, {
      expected_version: item.version,
      archived: true,
    });
  const dates = ["2026-01-01", "2026-01-02", "2026-10-01"];
  for (const [index, date] of dates.entries())
    await write(
      page,
      "/sport/measurements",
      {
        measured_on: date,
        weight_kg: 80 - index,
        neck_cm: 38,
        waist_cm: 90 - index,
      },
      "POST",
    );
  await page.goto("/sport?tab=measurements");
  const first = page.locator(".sport-measurement").first();
  await first.getByRole("button", { name: "Modifier", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('input[name="neck_cm"]')).toBeHidden();
  await dialog.locator('input[name="weight_kg"]').fill("77.5");
  page.once("dialog", (modal) => modal.dismiss());
  await page.keyboard.press("Escape");
  await expect(dialog.locator('input[name="weight_kg"]')).toHaveValue("77.5");
  await dialog
    .getByRole("button", { name: "Enregistrer les mensurations" })
    .click();
  await expect(dialog).toHaveCount(0);
  const stored = (await read<Measurement[]>(page, "/sport/measurements"))[0];
  expect(stored.neck_cm).toBe(38);
  expect(stored.waist_cm).toBe(88);
  await expect(first.locator(".sport-measure-delta").first()).toHaveText(
    "-1,5 kg",
  );
  await first
    .getByRole("button", { name: "Voir le graphique : Poids" })
    .click();
  const chart = page.locator(".sport-chart").first();
  const xs = await chart
    .locator(".sport-chart-dot")
    .evaluateAll((points) =>
      points.map((point) => Number(point.getAttribute("cx"))),
    );
  expect(xs).toHaveLength(3);
  expect(xs[1] - xs[0]).toBeLessThan((xs[2] - xs[0]) / 100);
  const points = chart.locator(".sport-chart-point");
  await points.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(points.nth(1)).toBeFocused();
  await expect(chart.locator(".sport-chart-value")).toContainText("79");
  await page.keyboard.press("Escape");
  await expect(chart.locator(".sport-chart-value")).toContainText(
    "Touchez un point",
  );
  await chart.getByText("Voir les valeurs", { exact: true }).click();
  await expect(chart.locator("tbody tr")).toHaveCount(3);
  await page.getByLabel("Du", { exact: true }).fill("2026-12-31");
  await page.getByRole("button", { name: "Appliquer la période" }).click();
  await expect(page.locator("#sport-period-error")).toBeVisible();
  await expect(chart.locator(".sport-chart-dot")).toHaveCount(3);
  // Restore the measurement fixture for suites that share this synthetic account.
  for (const item of await read<Measurement[]>(page, "/sport/measurements"))
    await write(page, `/sport/measurements/${item.id}/archive`, {
      expected_version: item.version,
      archived: true,
    });
  for (const item of previous) {
    const current = await read<Measurement>(
      page,
      `/sport/measurements/${item.id}`,
    );
    await write(page, `/sport/measurements/${item.id}/archive`, {
      expected_version: current.version,
      archived: false,
    });
  }
});

test("Sport UX : historique filtré, lien direct et séances voisines", async ({
  page,
}) => {
  const source = await program(page, `Historique UX ${Date.now()}`, 1);
  const sessions: Training[] = [];
  for (const outcome of ["cancelled", "completed"]) {
    let session = await write<Training>(
      page,
      "/sport/sessions",
      { workout_id: source.id, expected_version: source.version },
      "POST",
    );
    session = await write<Training>(
      page,
      `/sport/sessions/${session.id}/finish`,
      { expected_version: session.version, outcome, notes: `Note ${outcome}` },
    );
    sessions.push(session);
  }
  await page.goto(`/sport?tab=history&history_workout=${source.id}`);
  await expect(page.locator(".sport-history-row")).toHaveCount(2);
  await page.getByLabel("État de la séance").selectOption("completed");
  await expect(page.locator(".sport-history-row")).toHaveCount(1);
  await page.locator(".sport-history-row").click();
  await expect(page).toHaveURL(new RegExp(`session=${sessions[1].id}`));
  let detail = page.getByRole("dialog", { name: source.name });
  await expect(detail).toContainText("Note completed");
  await expect(
    detail.getByRole("button", { name: "Séance plus ancienne" }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("État de la séance")).toHaveValue("completed");
  await page.goto(
    `/sport?tab=history&history_workout=${source.id}&session=${sessions[1].id}`,
  );
  detail = page.getByRole("dialog", { name: source.name });
  const older = detail.getByRole("button", { name: "Séance plus ancienne" });
  await expect(older).toHaveAttribute("aria-disabled", "false");
  await older.click();
  await expect(detail).toContainText("Note cancelled");
  await expect(older).toBeFocused();
  await page.reload();
  await expect(detail).toContainText("Note cancelled");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".sport-history-row")).toHaveCount(2);
});

test("Sport UX : réglages protégés pour langue et déconnexion, puis rapprochement", async ({
  page,
}) => {
  await page.goto("/sport?tab=settings");
  const rest = page.locator('input[name="rest_seconds"]');
  await rest.fill("180");
  page.once("dialog", (modal) => modal.dismiss());
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(rest).toHaveValue("180");
  await expect(
    page.getByRole("combobox", { name: "Langue", exact: true }),
  ).toHaveValue("fr");
  page.once("dialog", (modal) => modal.dismiss());
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await expect(rest).toHaveValue("180");
  await write(page, "/sport/settings", { rest_seconds: 120 });
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await page
    .getByRole("button", { name: "Comparer avec la version enregistrée" })
    .click();
  await expect(page.locator(".sport-comparison")).toContainText("120");
  await expect(page.locator(".sport-comparison")).toContainText("180");
  await page.getByRole("button", { name: "Garder mon brouillon" }).click();
  await expect(rest).toHaveValue("180");
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(
    page.locator(".sport-settings").getByRole("status"),
  ).toContainText(/enregistr/);
  expect(
    (await read<SportSettings>(page, "/sport/settings")).rest_seconds,
  ).toBe(180);
});

test("Sport UX : contexte explicite et erreur de préférence sans changement de vue", async ({
  page,
}) => {
  const source = await program(page, `HYROX UX ${Date.now()}`);
  await page.goto(`/sport?tab=workouts&program=${source.id}`);
  await expect(page.locator(".sport-hyrox-brand")).toBeVisible();
  await page.getByLabel("Style du programme").selectOption("standard");
  await expect(page.locator(".sport-hyrox-brand")).toHaveCount(0);
  await page.getByRole("button", { name: "Enregistrer le programme" }).click();
  expect(
    (await read<Workout>(page, `/sport/workouts/${source.id}`)).context,
  ).toBe("standard");
  await page.route(
    "**/api/v1/sport/settings",
    (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 503,
            json: { detail: "Préférence indisponible" },
          })
        : route.continue(),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "momentanément indisponible",
  );
  await expect(page.locator(".sport-workout-grid")).toHaveAttribute(
    "data-view",
    "grid",
  );
  expect(
    (await read<SportSettings>(page, "/sport/settings")).workouts_view,
  ).toBe("grid");
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.locator(".sport-workout-grid")).toHaveAttribute(
    "data-view",
    "list",
  );
});

test("Sport UX : paysage tactile commun, fond inerte et réduction des animations", async ({
  browser,
  page,
}) => {
  for (const id of ["tasks", "sport", "tracking", "okr", "recipes"])
    await write(page, `/applications/${id}`, { enabled: true });
  const context = await browser.newContext({
    baseURL: process.env.LIFE_E2E_URL ?? "http://127.0.0.1:18106",
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
    locale: "fr-FR",
  });
  await context.addCookies(cookies);
  const screen = await context.newPage();
  for (const id of ["tasks", "sport", "tracking", "okr", "recipes"]) {
    await screen.goto(`/${id}`);
    const opener = screen.getByRole("button", {
      name: "Ouvrir la navigation",
      exact: true,
    });
    await expect(opener).toBeVisible();
    await opener.click();
    await expect(screen.locator(".application-sidebar")).toHaveAttribute(
      "role",
      "dialog",
    );
    await expect(
      screen.getByRole("button", { name: "Fermer la navigation", exact: true }),
    ).toBeFocused();
    expect(
      await screen
        .locator("main")
        .evaluate((element) => (element as HTMLElement).inert),
    ).toBe(true);
    await screen
      .getByRole("link", { name: "Documentation", exact: true })
      .scrollIntoViewIfNeeded();
    await screen.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    expect(
      await screen
        .locator("main")
        .evaluate((element) => (element as HTMLElement).inert),
    ).toBe(false);
  }
  await screen.goto("/sport?tab=workouts&program=new");
  await screen.getByLabel("Nom du programme").fill("Mouvement réduit");
  await screen
    .getByRole("button", { name: "Ajouter un exercice", exact: true })
    .click();
  await screen.locator(".sport-picker-item").first().click();
  await expect(screen.locator(".sport-plan-entry")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(screen.locator(".sport-plan-entry input").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await context.close();
});
