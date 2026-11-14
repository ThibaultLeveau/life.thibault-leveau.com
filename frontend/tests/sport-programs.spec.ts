import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { ExercisePage, Training, Workout } from "../src/apps/sport/types";

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
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
  await write(page, "/applications/sport", { enabled: true }, "PUT");
  await write(page, "/preferences", { theme: "light" }, "PUT");
  const active: Training | null = await (
    await page.request.get("/api/v1/sport/sessions/active")
  ).json();
  if (active)
    await write(
      page,
      `/sport/sessions/${active.id}/finish`,
      { expected_version: active.version, outcome: "cancelled" },
      "PUT",
    );
});
async function write<T>(
  page: Page,
  path: string,
  data: unknown,
  method = "POST",
): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    headers,
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function fits(page: Page) {
  expect(
    await page.evaluate(() => ({
      width: innerWidth,
      content: document.documentElement.scrollWidth,
    })),
  ).toEqual(
    expect.objectContaining({
      width: page.viewportSize()!.width,
      content: page.viewportSize()!.width,
    }),
  );
  const overflow = await page
    .locator(
      ".sport-content input, .sport-content select, .sport-content textarea, dialog[open] input, dialog[open] select, dialog[open] textarea",
    )
    .evaluateAll((fields) =>
      fields
        .filter((field) => {
          const box = field.getBoundingClientRect();
          return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
        })
        .map((field) => field.outerHTML),
    );
  expect(overflow).toEqual([]);
}
async function add(page: Page, query: string) {
  await page
    .getByRole("button", { name: "Ajouter un exercice", exact: true })
    .click();
  const search = page.getByLabel("Rechercher un exercice");
  await expect(search).toBeFocused();
  await search.fill(query);
  await page
    .locator(".sport-picker-item")
    .filter({ hasText: query })
    .first()
    .click();
  await expect(page.getByLabel("Nombre de séries").last()).toBeFocused();
}

for (const width of [320, 375, 768, 1440]) {
  test(`Programme : création, édition, API et erreurs à ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/sport");
    if (width === 320) await page.getByLabel("Programmes archivés").check();
    await page
      .getByRole("button", { name: "Nouveau programme", exact: true })
      .click();
    await expect(page).toHaveURL(/program=new/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Nouveau programme", exact: true }),
    ).toBeFocused();
    await expect(page).toHaveTitle("Nouveau programme · Sport · LifeOS");
    const name = `Programme ${width} ${Date.now()}`;
    await page.getByLabel("Nom du programme").fill(name);
    await page
      .getByLabel("Notes de préparation")
      .fill("Échauffement et charge totale.");
    await page
      .getByRole("button", { name: "Actualiser l’entraînement" })
      .click();
    await expect(page.getByLabel("Nom du programme")).toHaveValue(name);
    await add(page, "Développé couché à la barre");
    await page.getByLabel("Nombre de séries").fill("2");
    await page.getByLabel("Charge totale (kg)", { exact: true }).fill("42.5");
    await page.getByLabel("Répétitions (rép.)", { exact: true }).fill("8");
    await add(page, "Burpees");
    await page.getByLabel("Nombre de séries").last().fill("1");
    await page
      .getByLabel("Répétitions (rép.)", { exact: true })
      .last()
      .fill("12");
    await page
      .getByRole("button", { name: "Monter Burpees", exact: true })
      .click();
    await expect(page.locator(".sport-plan-entry").first()).toContainText(
      "Burpees",
    );
    await expect(page.getByLabel("Nombre de séries").first()).toHaveValue("1");
    await expect(
      page.getByLabel("Charge totale (kg)", { exact: true }),
    ).toHaveValue("42.5");
    await add(page, "Planche sur les avant-bras");
    await page
      .locator(".sport-plan-entry")
      .last()
      .getByRole("button", { name: /^Retirer/ })
      .click();
    await expect(page.locator(".sport-plan-entry")).toHaveCount(2);
    await fits(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`creation-${width}.png`),
      fullPage: true,
    });
    await page.route("**/api/v1/sport/workouts", (route) =>
      route.abort("failed"),
    );
    await page
      .getByRole("button", { name: "Enregistrer le programme" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Connexion interrompue",
    );
    await expect(page.getByLabel("Nom du programme")).toHaveValue(name);
    await page.unroute("**/api/v1/sport/workouts");
    await page
      .getByRole("button", { name: "Enregistrer le programme" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Programmes", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Programmes archivés")).not.toBeChecked();
    const workouts: Workout[] = await (
      await page.request.get("/api/v1/sport/workouts")
    ).json();
    const stored = workouts.find((w) => w.name === name)!;
    expect(stored.entries.map((entry) => entry.sets)).toEqual([1, 2]);
    expect(stored.entries[0].target.reps).toBe(12);
    expect(stored.entries[1].target.weight_kg).toBe(42.5);
    await page
      .getByRole("button", { name: `Modifier ${name}`, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`program=${stored.id}`));
    await page.reload();
    await expect(page.getByLabel("Nom du programme")).toHaveValue(name);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("Nom du programme").fill(`${name} modifié`);
    await page
      .getByRole("button", { name: "Enregistrer le programme" })
      .click();
    await expect(
      page.getByRole("heading", { name: `${name} modifié`, exact: true }),
    ).toBeVisible();
    const updated = await (
      await page.request.get(`/api/v1/sport/workouts/${stored.id}`)
    ).json();
    expect(updated.version).toBe(2);
    expect(updated.entries).toEqual(stored.entries);
  });
}

test("Programme : navigation, annulation, conflit et limites explicites", async ({
  page,
}) => {
  await page.goto("/sport?tab=workouts");
  await page
    .getByRole("button", { name: "Nouveau programme", exact: true })
    .click();
  await page.getByLabel("Nom du programme").fill("Brouillon conservé");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByLabel("Nom du programme")).toHaveValue(
    "Brouillon conservé",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/program=new/);
  await expect(page.getByLabel("Nom du programme")).toHaveValue(
    "Brouillon conservé",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Programmes", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Nom du programme")).toHaveValue("");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();

  const exercises: ExercisePage = await (
    await page.request.get("/api/v1/sport/exercises?q=burpees&kind=reps")
  ).json();
  const data = {
    name: `Limites ${Date.now()}`,
    entries: Array.from({ length: 50 }, () => ({
      exercise_id: exercises.items[0].id,
      sets: 6,
      target: {},
    })),
  };
  const program = await write<Workout>(page, "/sport/workouts", data);
  await page.goto(`/sport?tab=workouts&program=${program.id}`);
  await expect(
    page.getByRole("button", { name: "Ajouter un exercice", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Nombre de séries").first().fill("7");
  await expect(page.getByRole("alert")).toContainText("maximum 300 séries");
  await expect(
    page.getByRole("button", { name: "Enregistrer le programme" }),
  ).toBeDisabled();
  await page.getByLabel("Nombre de séries").first().fill("6");
  await write(
    page,
    `/sport/workouts/${program.id}`,
    { ...data, name: "Modification autre appareil", expected_version: 1 },
    "PUT",
  );
  await page.getByLabel("Nom du programme").fill("Ma modification");
  await page.getByRole("button", { name: "Enregistrer le programme" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Nom du programme")).toHaveValue(
    "Ma modification",
  );
  expect(
    (
      await (
        await page.request.get(`/api/v1/sport/workouts/${program.id}`)
      ).json()
    ).name,
  ).toBe("Modification autre appareil");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.goto(
    "/sport?tab=workouts&program=00000000-0000-0000-0000-000000000000",
  );
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("form")).toHaveCount(0);
  await page.getByRole("button", { name: "Tous les programmes" }).click();
  await expect(
    page.getByRole("heading", { name: "Programmes", exact: true }),
  ).toBeVisible();
});

test("Toutes les pages Sport : mobile, tablette, ordinateur, thèmes et formulaires", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const exercise = await write<{ id: string }>(page, "/sport/exercises", {
    name: "Exercice".repeat(20),
    kind: "reps",
    muscle_group: "Général",
    equipment: "Sans matériel",
    notes: "Note".repeat(100),
  });
  const workout = await write<Workout>(page, "/sport/workouts", {
    name: "Programme".repeat(17),
    notes: "Notes".repeat(100),
    entries: [{ exercise_id: exercise.id, sets: 1, target: { reps: 12 } }],
  });
  let training = await write<Training>(page, "/sport/sessions", {
    workout_id: workout.id,
    expected_version: workout.version,
  });
  training = await write(
    page,
    `/sport/sessions/${training.id}/sets/0/0`,
    { expected_version: training.version, values: { reps: 15 } },
    "PUT",
  );
  await write(
    page,
    `/sport/sessions/${training.id}/finish`,
    {
      expected_version: training.version,
      outcome: "completed",
      notes: "Ressenti".repeat(100),
    },
    "PUT",
  );
  await write(page, "/sport/sessions", {
    workout_id: workout.id,
    expected_version: workout.version,
  });
  const tabs = [
    "workouts",
    "training",
    "exercises",
    "measurements",
    "statistics",
    "history",
    "settings",
  ];
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of tabs) {
      await page.goto(`/sport?tab=${tab}`);
      await expect(page.locator(".sport-content h1")).toBeVisible();
      await expect(page.getByText("Chargement…", { exact: true })).toHaveCount(
        0,
      );
      await fits(page);
      if (width < 800) {
        const small = await page
          .locator(
            ".sport-content input, .sport-content select, .sport-content textarea",
          )
          .evaluateAll((fields) =>
            fields
              .filter(
                (field) =>
                  field.getClientRects().length &&
                  parseFloat(getComputedStyle(field).fontSize) < 16,
              )
              .map((field) => field.outerHTML),
          );
        expect(small).toEqual([]);
      }
      if (width === 320 || width === 1440)
        await page.screenshot({
          path: testInfo.outputPath(`${tab}-${width}.png`),
          fullPage: false,
        });
      const button =
        tab === "exercises"
          ? "Nouvel exercice"
          : tab === "measurements"
            ? "Nouveau relevé"
            : null;
      if (button) {
        await page.getByRole("button", { name: button, exact: true }).click();
        await fits(page);
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Fermer", exact: true })
          .click();
      }
      if (tab === "history") {
        await page.locator(".sport-history-row").first().click();
        await fits(page);
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Fermer", exact: true })
          .click();
      }
    }
    // Exercise dark mode through the persisted preference, then render real pages.
    await write(page, "/preferences", { theme: "dark" }, "PUT");
    await page.goto(`/sport?tab=workouts&program=${workout.id}`);
    await expect(page.getByLabel("Nom du programme")).toHaveValue(workout.name);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await fits(page);
    await page.screenshot({
      path: testInfo.outputPath(`edition-dark-${width}.png`),
      fullPage: true,
    });
    await write(page, "/preferences", { theme: "light" }, "PUT");
    for (const path of ["/", "/applications", "/tasks"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByRole("heading").first()).toBeVisible();
      await fits(page);
    }
  }
  expect(errors).toEqual([]);
});

test.describe("programme tactile", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  test("clavier réduit, recherche sans enregistrement involontaire et retour au titre", async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      const viewport = Object.assign(new EventTarget(), {
        height: 812,
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
    await page.goto("/sport?tab=workouts&program=new");
    const name = page.getByLabel("Nom du programme");
    await name.fill("Programme tactile");
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("test-viewport", { detail: { height: 360 } }),
      ),
    );
    await expect
      .poll(async () => {
        const box = (await name.boundingBox())!;
        return box.y >= 16 && box.y + box.height < 328;
      })
      .toBeTruthy();
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("test-viewport", { detail: { height: 812 } }),
      ),
    );
    await add(page, "Burpees");
    await page
      .getByRole("button", { name: "Ajouter un exercice", exact: true })
      .click();
    const search = page.getByLabel("Rechercher un exercice");
    await search.fill("planche");
    await search.press("Enter");
    await expect(
      page.getByRole("form", { name: "Nouveau programme" }),
    ).toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("test-viewport", { detail: { height: 360 } }),
      ),
    );
    await expect
      .poll(async () => {
        const box = (await search.boundingBox())!;
        return box.y >= 16 && box.y + box.height < 328;
      })
      .toBeTruthy();
    await fits(page);
    await page.screenshot({
      path: testInfo.outputPath("programme-clavier.png"),
    });
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("test-viewport", { detail: { height: 812 } }),
      ),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Tous les programmes" }).click();
    await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Réglages", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Réglages", exact: true }),
    ).toBeFocused();
    await expect
      .poll(() =>
        page.locator(".sport-shell").evaluate((element) => element.scrollTop),
      )
      .toBe(0);
  });
});
