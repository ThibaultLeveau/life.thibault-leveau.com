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
  if (auth && headers)
    await auth.request.put("/api/v1/preferences", {
      headers,
      data: { locale: "fr" },
    });
  await auth?.close();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
  await write(page, "/applications/sport", { enabled: true }, "PUT");
  await write(page, "/preferences", { theme: "light", locale: "fr" }, "PUT");
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
    await expect(
      page.getByRole("button", { name: "Archiver", exact: true }),
    ).toHaveCount(0);
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

test("Cartes de programme compactes : ordinateur, mobile, thèmes et langues", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date("2028-03-25T11:00:00Z") });
  const exercises = [];
  for (const name of ["Course sur tapis", "SkiErg", "Rameur", "Burpees"]) {
    const response = await page.request.get(
      `/api/v1/sport/exercises?q=${encodeURIComponent(name)}`,
    );
    expect(response.ok()).toBeTruthy();
    const catalogue: ExercisePage = await response.json();
    const exercise = catalogue.items.find((item) => item.builtin);
    expect(exercise, `Default catalogue exercise: ${name}`).toBeDefined();
    exercises.push(exercise!);
  }
  const entries = exercises.map((exercise) => ({
    exercise_id: exercise.id,
    sets: 3,
    target: {},
  }));
  const regular = await write<Workout>(page, "/sport/workouts", {
    name: "Programme haut du corps",
    notes: "Échauffement puis progression régulière. ".repeat(15),
    entries,
  });
  const hyrox = await write<Workout>(page, "/sport/workouts", {
    name: "HYROX — Cardio",
    competition_date: "2028-03-28",
    entries,
  });
  const shoulders = await write<Workout>(page, "/sport/workouts", {
    name: "Programme B — Épaules + Dos",
    entries,
  });
  // Isolate real API fixtures so captures do not depend on previous scenarios.
  await page.route("**/api/v1/sport/workouts?archived=false", async (route) => {
    const response = await route.fetch();
    const programs: Workout[] = await response.json();
    await route.fulfill({
      response,
      json: programs.filter((program) =>
        [regular.id, hyrox.id, shoulders.id].includes(program.id),
      ),
    });
  });
  for (const locale of ["fr", "en"])
    for (const theme of ["light", "dark"]) {
      await write(page, "/preferences", { theme, locale }, "PUT");
      for (const width of [320, 375, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/sport");
        const cards = page.locator(".sport-workout");
        await expect(cards).toHaveCount(3);
        await expect(
          page.getByRole("button", { name: /^(Archiver|Archive)$/ }),
        ).toHaveCount(0);
        for (const program of [regular, hyrox, shoulders]) {
          const card = cards.filter({
            has: page.getByRole("heading", { name: program.name, exact: true }),
          });
          const mobile = width < 560;
          await expect(card.locator("li:visible")).toHaveCount(mobile ? 2 : 4);
          await expect(card.locator("li small:visible")).toHaveCount(
            mobile ? 0 : 4,
          );
          await expect(card.locator(".sport-workout-more:visible")).toHaveCount(
            mobile ? 1 : 0,
          );
          if (mobile)
            await expect(card).toContainText(
              locale === "fr" ? "+ 2 autres exercices" : "+ 2 more exercises",
            );
          const height = (await card.boundingBox())!.height;
          expect(height).toBeLessThan(
            mobile ? 350 : program.id === hyrox.id ? 600 : 460,
          );
          for (const button of await card.getByRole("button").all()) {
            const box = (await button.boundingBox())!;
            expect(box.height).toBeGreaterThanOrEqual(44);
            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
          }
        }
        await expect(cards.getByAltText("HYROX")).toBeVisible();
        await expect(cards.locator("time")).toHaveAttribute(
          "datetime",
          "2028-03-28",
        );
        await fits(page);
        await page.screenshot({
          path: info.outputPath(`cards-${locale}-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
  await write(page, "/preferences", { locale: "fr" }, "PUT");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/sport");
  const edit = page.getByRole("button", {
    name: `Modifier ${regular.name}`,
    exact: true,
  });
  await edit.focus();
  await edit.press("Enter");
  await expect(page.locator(".sport-plan-entry")).toHaveCount(4);
  await expect(page.getByLabel("Notes de préparation")).toHaveValue(
    regular.notes,
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page
    .locator(".sport-workout")
    .filter({
      has: page.getByRole("heading", { name: hyrox.name, exact: true }),
    })
    .getByRole("button", { name: "Démarrer l’entraînement", exact: true })
    .click();
  await expect(page.locator(".sport-training")).toBeVisible();
  await expect(page.locator(".sport-session-exercise")).toHaveCount(4);
});

for (const locale of ["fr", "en"]) {
  test(`Archivage dans l’éditeur : brouillon, erreur, conflit et restauration (${locale})`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: locale === "fr" ? 320 : 1440,
      height: 900,
    });
    const program = await write<Workout>(page, "/sport/workouts", {
      name: `HYROX archive ${locale}`,
      notes: "Notes conservées",
      competition_date: "2028-02-29",
      entries: [
        {
          exercise_id: "builtin-da98dd6929927833d279",
          sets: 2,
          target: { distance_m: 1000, duration_seconds: 420 },
        },
      ],
    });
    await write(page, "/preferences", { locale }, "PUT");
    await page.goto(`/sport?tab=workouts&program=${program.id}`);
    const archive = page.getByRole("button", {
      name: locale === "fr" ? "Archiver" : "Archive",
      exact: true,
    });
    const name = page.getByLabel(
      locale === "fr" ? "Nom du programme" : "Program name",
    );
    await name.fill("Brouillon non enregistré");
    page.once("dialog", (dialog) => dialog.dismiss());
    await archive.click();
    await expect(name).toHaveValue("Brouillon non enregistré");
    expect(
      (
        await (
          await page.request.get(`/api/v1/sport/workouts/${program.id}`)
        ).json()
      ).archived_at,
    ).toBeNull();
    await page.route(
      `**/api/v1/sport/workouts/${program.id}/archive`,
      (route) => route.abort("failed"),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await archive.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(name).toHaveValue("Brouillon non enregistré");
    await expect(archive).toBeEnabled();
    await page.unroute(`**/api/v1/sport/workouts/${program.id}/archive`);
    const current = await write<Workout>(
      page,
      `/sport/workouts/${program.id}`,
      {
        name: program.name,
        notes: "Modifié ailleurs",
        competition_date: program.competition_date,
        entries: program.entries.map(({ exercise_id, sets, target }) => ({
          exercise_id,
          sets,
          target,
        })),
        expected_version: program.version,
      },
      "PUT",
    );
    const conflict = page.waitForResponse((response) =>
      response.url().endsWith(`/workouts/${program.id}/archive`),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await archive.click();
    expect((await conflict).status()).toBe(409);
    await expect(name).toHaveValue("Brouillon non enregistré");
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await expect(name).toHaveValue(program.name);
    await archive.focus();
    await archive.press("Enter");
    await expect(page).not.toHaveURL(/program=/);
    await expect(
      page.getByRole("heading", { name: program.name, exact: true }),
    ).toHaveCount(0);
    const archived: Workout = await (
      await page.request.get(`/api/v1/sport/workouts/${program.id}`)
    ).json();
    expect(archived.archived_at).not.toBeNull();
    expect(archived.version).toBe(current.version + 1);
    expect(archived.entries).toEqual(current.entries);
    expect(archived.notes).toBe("Modifié ailleurs");
    expect(archived.competition_date).toBe(program.competition_date);
    expect(archived.created_at).toBe(program.created_at);
    await page
      .getByLabel(locale === "fr" ? "Programmes archivés" : "Archived programs")
      .check();
    const card = page.locator(".sport-workout").filter({
      has: page.getByRole("heading", { name: program.name, exact: true }),
    });
    await card
      .getByRole("button", {
        name: `${locale === "fr" ? "Modifier" : "Edit"} ${program.name}`,
        exact: true,
      })
      .click();
    await expect(archive).toHaveCount(0);
    await page
      .getByRole("button", {
        name: locale === "fr" ? "Tous les programmes" : "All programs",
        exact: true,
      })
      .click();
    await card
      .getByRole("button", {
        name: locale === "fr" ? "Restaurer" : "Restore",
        exact: true,
      })
      .click();
    await expect(card).toHaveCount(0);
    const restored: Workout = await (
      await page.request.get(`/api/v1/sport/workouts/${program.id}`)
    ).json();
    expect(restored.archived_at).toBeNull();
    expect(restored.entries).toEqual(current.entries);
    expect(restored.competition_date).toBe(program.competition_date);
    await write(page, "/preferences", { locale: "fr" }, "PUT");
  });
}
