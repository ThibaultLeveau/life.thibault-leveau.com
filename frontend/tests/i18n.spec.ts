import { expect, test, type Page } from "@playwright/test";
import type { ExercisePage, Training, Workout } from "../src/apps/sport/types";
import type { Task, Workspace } from "../src/apps/tasks/types";

const credentials = {
  username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
  password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
};
let headers: Record<string, string>;
test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/v1/auth/session", {
    data: credentials,
  });
  expect(response.ok()).toBeTruthy();
  headers = { "X-CSRF-Token": (await response.json()).csrf_token };
  await page.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
  for (const id of ["tasks", "sport"])
    expect(
      (
        await page.request.put(`/api/v1/applications/${id}`, {
          headers,
          data: { enabled: true },
        })
      ).ok(),
    ).toBeTruthy();
  const active: Training | null = await (
    await page.request.get("/api/v1/sport/sessions/active")
  ).json();
  if (active)
    await page.request.put(`/api/v1/sport/sessions/${active.id}/finish`, {
      headers,
      data: { expected_version: active.version, outcome: "cancelled" },
    });
});
test.afterEach(async ({ page }) => {
  await page.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
});
async function language(page: Page, value: "en" | "fr") {
  await page
    .getByRole("combobox", { name: /^(Language|Langue)$/ })
    .filter({ visible: true })
    .selectOption(value);
  await expect(page.locator("html")).toHaveAttribute("lang", value);
}
async function apiCreate<T>(
  page: Page,
  path: string,
  data: unknown,
): Promise<T> {
  const response = await page.request.post(`/api/v1${path}`, { headers, data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("anonymous browser language and account preference survive sign-in, theme changes and reload", async ({
  page,
  browser,
}) => {
  const guest = await browser.newContext({
    baseURL: process.env.LIFE_E2E_URL ?? "http://127.0.0.1:18106",
    locale: "en-GB",
  });
  const anonymous = await guest.newPage();
  await anonymous.goto("/");
  await expect(
    anonymous.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(anonymous).toHaveTitle("Sign in · LifeOS");
  await language(anonymous, "fr");
  await expect(anonymous.getByLabel("Mot de passe")).toBeVisible();
  await guest.close();

  await page.goto("/");
  await language(page, "en");
  await expect(
    page.getByRole("heading", { name: "My applications" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Tasks" })).toBeVisible();
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await (await page.request.get("/api/v1/preferences")).json()).toEqual({
    theme: "dark",
    locale: "en",
  });
  await page.goto("/applications");
  await expect(
    page.getByRole("heading", { name: "Application library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Enable Tasks" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: credentials.username, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connexion", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Identifiant", { exact: true })
    .fill(credentials.username);
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill(credentials.password);
  const logged = page.waitForResponse(
    (r) => r.url().endsWith("/auth/session") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  headers = { "X-CSRF-Token": (await (await logged).json()).csrf_token };
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Language" })).toHaveValue(
    "en",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("English task scheduling preserves personal titles and existing workspace labels", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2027-01-27T10:00:00Z"));
  const space = await apiCreate<Workspace>(page, "/workspaces", {
    name: "Mon espace bilingue",
  });
  await page.goto(`/tasks?space=${space.id}`);
  await language(page, "en");
  await expect(page.getByRole("heading", { name: space.name })).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Lire mon livre every Monday and Thursday for three times");
  await expect(page.locator(".schedule-detected")).toContainText("Monday");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/tasks") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const task: Task = await (await saved).json();
  expect(task.title).toBe("Lire mon livre");
  expect(task.recurrence?.max_occurrences).toBe(3);
  expect(task.due_date).toBe("2027-01-28");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Complete: Lire mon livre", exact: true })
    .click();
  await expect(page.locator(".task-feedback-toast")).toContainText(
    "Occurrence completed. Next:",
  );
  await language(page, "fr");
  await expect(
    page.getByRole("button", { name: "Lire mon livre", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/v1/tasks/${task.id}`)).json())
      .recurrence_completed,
  ).toBe(1);
  await page
    .getByRole("button", { name: "Lire mon livre", exact: true })
    .click();
  await expect(page.getByLabel("Titre", { exact: true })).toHaveValue(
    "Lire mon livre",
  );
  await expect(page.locator(".schedule-trigger")).toContainText("lundi");
  await page.keyboard.press("Escape");
  await language(page, "en");
  await apiCreate<Task>(page, "/tasks", {
    workspace_id: space.id,
    title: "Annual review",
    due_date: "2027-05-24",
    recurrence: {
      start_date: "2027-01-01",
      timezone: "Europe/Paris",
      rrule: "FREQ=YEARLY;BYDAY=21MO",
      mode: "scheduled",
      excluded_dates: [],
    },
  });
  await page.reload();
  await expect(
    page.getByLabel("Recurrence: Every year · 21st Monday", { exact: true }),
  ).toBeVisible();
});

test("default and personal exercises remain distinct throughout programs, training and history", async ({
  page,
}) => {
  const catalogue: ExercisePage = await (
    await page.request.get(
      "/api/v1/sport/exercises?q=Développé%20couché%20à%20la%20barre",
    )
  ).json();
  const builtin = catalogue.items.find((e) => e.builtin)!;
  const personal = await apiCreate<{ id: string }>(page, "/sport/exercises", {
    name: builtin.name,
    kind: builtin.kind,
    notes: "Mes notes françaises",
  });
  const program = await apiCreate<Workout>(page, "/sport/workouts", {
    name: "Mon programme bilingue",
    entries: [
      { exercise_id: builtin.id, sets: 1 },
      { exercise_id: personal.id, sets: 1 },
    ],
  });
  await page.goto("/sport?tab=exercises");
  await language(page, "en");
  await page.getByLabel("Search", { exact: true }).fill("Barbell bench press");
  const row = page.locator(".sport-exercise").filter({
    has: page.getByRole("heading", {
      name: "Barbell bench press",
      exact: true,
    }),
  });
  await expect(row).toContainText("Default");
  await expect(row).toContainText("Chest");
  await page.getByLabel("Search", { exact: true }).fill(builtin.name);
  await expect(page.locator(".sport-exercise")).toHaveCount(1);
  await expect(page.locator(".sport-exercise")).toContainText("Personal");
  await page.goto("/sport?tab=workouts");
  const card = page.locator(".sport-workout").filter({
    has: page.getByRole("heading", { name: program.name, exact: true }),
  });
  await expect(card).toContainText("Barbell bench press");
  await expect(card).toContainText(builtin.name);
  await card.getByRole("button", { name: "Start training session" }).click();
  await expect(
    page.getByRole("heading", { name: "Training", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Barbell bench press", exact: true }),
  ).toBeVisible();
  await language(page, "fr");
  await expect(
    page.getByRole("heading", {
      name: "Développé couché à la barre",
      exact: true,
    }),
  ).toHaveCount(2);
  const active: Training = await (
    await page.request.get("/api/v1/sport/sessions/active")
  ).json();
  await page.request.put(`/api/v1/sport/sessions/${active.id}/finish`, {
    headers,
    data: {
      expected_version: active.version,
      outcome: "cancelled",
      notes: "Mon ressenti",
    },
  });
  await page.goto("/sport?tab=history");
  await language(page, "en");
  await expect(page.locator(".sport-history")).toContainText(program.name);
  await expect(page.locator(".sport-history")).toContainText("Cancelled");
  await page
    .locator(".sport-history-row")
    .filter({ hasText: program.name })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Barbell bench press");
  await expect(page.getByRole("dialog")).toContainText("Mon ressenti");
});

test("HYROX countdowns and dates follow the account language without changing the program", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2028-03-25T12:00:00Z") });
  const program = await apiCreate<Workout>(page, "/sport/workouts", {
    name: "Prépa hYrOx bilingue",
    competition_date: "2028-03-28",
    entries: [{ exercise_id: "builtin-da98dd6929927833d279", sets: 1 }],
  });
  await page.goto(`/sport?tab=workouts&program=${program.id}`);
  await expect(
    page.getByRole("region", { name: "Préparation HYROX" }),
  ).toContainText("J−3");
  await language(page, "en");
  const brand = page.getByRole("region", { name: "HYROX preparation" });
  await expect(brand).toContainText("D−3");
  await expect(brand).toContainText("3 days until race day");
  await expect(brand).toContainText("28 March 2028");
  await expect(page.getByLabel("Date of your next HYROX")).toHaveValue(
    "2028-03-28",
  );
  await expect(page.getByLabel("Program name")).toHaveValue(program.name);
  await page.clock.setSystemTime(new Date("2028-03-27T12:00:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(brand).toContainText("1 day until race day");
  await page.clock.setSystemTime(new Date("2028-03-28T12:00:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(brand).toContainText("RACE DAY");
  await page.clock.setSystemTime(new Date("2028-03-29T12:00:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(brand).toContainText("AFTER THE RACE");
  await page.getByRole("button", { name: "Clear competition date" }).click();
  await expect(brand).toContainText("ON THE WAY");
  // Discard only the unsaved date edit when changing language.
  page.once("dialog", (dialog) => dialog.accept());
  await language(page, "fr");
  await expect(page.getByLabel("Date de votre prochain HYROX")).toHaveValue(
    "2028-03-28",
  );
  expect(
    await (
      await page.request.get(`/api/v1/sport/workouts/${program.id}`)
    ).json(),
  ).toEqual(program);
  await language(page, "en");
  await page.setViewportSize({ width: 320, height: 760 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await expect(brand).toBeVisible();
  await page.screenshot({
    path: info.outputPath("english-hyrox-mobile.png"),
    fullPage: true,
  });
});

test("a delayed French response cannot replace the English catalogue", async ({
  page,
}) => {
  await page.goto("/sport?tab=exercises");
  await expect(page.locator(".sport-exercise").first()).toBeVisible();
  let release!: () => void;
  let reached!: () => void;
  let fulfilled!: () => void;
  const completed = new Promise<void>((resolve) => {
    fulfilled = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/sport/exercises?**", async (route) => {
    if (route.request().headers()["accept-language"] !== "fr")
      return route.continue();
    const response = await route.fetch();
    reached();
    await pending;
    await route.fulfill({ response }).catch(() => {});
    fulfilled();
  });
  await page.getByLabel("Rechercher", { exact: true }).fill("développé");
  await ready;
  await language(page, "en");
  await page.getByLabel("Search", { exact: true }).fill("Barbell bench press");
  const heading = page.getByRole("heading", {
    name: "Barbell bench press",
    exact: true,
  });
  await expect(heading).toBeVisible();
  release();
  await completed;
  await expect(heading).toBeVisible();
  await expect(
    page.locator(".sport-exercise").filter({ hasText: "Développé" }),
  ).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Language" })).toHaveValue(
    "en",
  );
});

test("language changes respect unsaved programs; mobile navigation and measurements remain accessible", async ({
  page,
}, info) => {
  await page.goto("/sport?tab=workouts&program=new");
  await page.getByLabel("Nom du programme").fill("Brouillon personnel");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("combobox", { name: "Langue" }).selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByLabel("Nom du programme")).toHaveValue(
    "Brouillon personnel",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await language(page, "en");
  await page.goto("/sport?tab=measurements");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["dark", "light"]) {
    const opener = page.getByRole("button", { name: "Open navigation" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Sport navigation" });
    await expect(
      dialog.getByRole("button", { name: "Close navigation", exact: true }),
    ).toBeFocused();
    const selector = dialog.getByRole("combobox", { name: "Language" });
    await selector.focus();
    await expect(selector).toBeFocused();
    await dialog
      .getByRole("combobox", { name: "Appearance" })
      .selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: info.outputPath(`english-mobile-${theme}.png`),
    });
  }
  await page.getByRole("button", { name: "New record", exact: true }).click();
  await expect(page.getByLabel("Weight (kg)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Waist (cm)", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("translated errors and expired sessions clear private views", async ({
  page,
}) => {
  await page.goto("/sport?tab=settings");
  await language(page, "en");
  await expect(
    page.getByLabel("Rest time between sets (seconds)"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved.");
  await page.route("**/api/v1/sport/exercises?**", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/sport?tab=exercises");
  await expect(page.getByRole("alert")).toContainText(
    "The service is temporarily unavailable",
  );
  await page.unroute("**/api/v1/sport/exercises?**");
  await page.route("**/api/v1/sport/exercises?**", (route) =>
    route.fulfill({ status: 401, json: { detail: "Session expired" } }),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connexion", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".application-sidebar")).toHaveCount(0);
  await expect(page.locator(".sport-exercise")).toHaveCount(0);
});
