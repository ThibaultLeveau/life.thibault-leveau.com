import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Locator,
} from "@playwright/test";
import type {
  Exercise,
  Measurement,
  SportSettings,
  Training,
  Workout,
} from "../src/apps/sport/types";
import {
  openSportActions,
  openSportFilters,
  openProgramOptions,
} from "./sport-mobile-helpers";

let auth: BrowserContext;
let headers: Record<string, string>;
let programs: Workout[];
let measurements: Measurement[] = [];
let originalMeasurements: Measurement[] = [];
let completed: Training;
const prefix = `Mobile ${Date.now()}`;
async function api<T>(
  path: string,
  data?: unknown,
  method = data ? "PUT" : "GET",
): Promise<T> {
  const response = await auth.request.fetch(`/api/v1${path}`, {
    method,
    headers,
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
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
  await api("/applications/sport", { enabled: true });
  const catalogue = await api<{ items: Exercise[] }>(
    "/sport/exercises?kind=weight_reps&limit=20",
  );
  programs = [];
  for (let i = 0; i < 5; i++)
    programs.push(
      await api<Workout>(
        "/sport/workouts",
        {
          name: `${prefix} ${i + 1}`,
          notes: "Échauffement, matériel et récupération.",
          entries: catalogue.items.slice(0, 3).map((exercise) => ({
            exercise_id: exercise.id,
            sets: 3,
            target: { weight_kg: 30, reps: 10 },
          })),
        },
        "POST",
      ),
    );
  const active = await api<Training | null>("/sport/sessions/active");
  if (active)
    await api(`/sport/sessions/${active.id}/finish`, {
      expected_version: active.version,
      outcome: "cancelled",
    });
  let session = await api<Training>(
    "/sport/sessions",
    { workout_id: programs[0].id, expected_version: programs[0].version },
    "POST",
  );
  session = await api<Training>(`/sport/sessions/${session.id}/sets/0/0`, {
    expected_version: session.version,
    values: { weight_kg: 35, reps: 10 },
  });
  completed = await api<Training>(`/sport/sessions/${session.id}/finish`, {
    expected_version: session.version,
    outcome: "completed",
  });
  const settings = await api<SportSettings>("/sport/settings");
  const existing = await api<Measurement[]>("/sport/measurements");
  originalMeasurements = existing;
  measurements = [];
  for (let i = 0; i < 5; i++) {
    const date = new Date(`${settings.server_today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - i);
    const measured_on = date.toISOString().slice(0, 10);
    const previous = existing.find(
      (value) => value.measured_on === measured_on,
    );
    measurements.push(
      await api<Measurement>(
        `/sport/measurements${previous ? `/${previous.id}` : ""}`,
        {
          measured_on,
          weight_kg: 78 + i,
          body_fat_pct: 17,
          neck_cm: 38,
          chest_cm: 100,
          waist_cm: 87,
          hips_cm: 98,
          arm_left_cm: 32,
          arm_right_cm: 32,
          thigh_left_cm: 57,
          thigh_right_cm: 57,
          calf_left_cm: 36,
          calf_right_cm: 36,
          notes: prefix,
          ...(previous ? { expected_version: previous.version } : {}),
        },
        previous ? "PUT" : "POST",
      ),
    );
  }
});
test.afterAll(async () => {
  // Restore records changed by this file; do not contaminate later suites.
  for (const item of measurements) {
    const current = await api<Measurement>(`/sport/measurements/${item.id}`);
    const original = originalMeasurements.find((value) => value.id === item.id);
    if (original) {
      const values = Object.fromEntries(
        Object.entries(original).filter(
          ([key]) =>
            key.endsWith("_cm") ||
            ["weight_kg", "body_fat_pct", "measured_on", "notes"].includes(key),
        ),
      );
      await api(`/sport/measurements/${item.id}`, {
        ...values,
        expected_version: current.version,
      });
    } else if (!current.archived_at)
      await api(`/sport/measurements/${item.id}/archive`, {
        expected_version: current.version,
        archived: true,
      });
  }
  await auth?.close();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(await auth.cookies());
  const active = await api<Training | null>("/sport/sessions/active");
  if (active)
    await api(`/sport/sessions/${active.id}/finish`, {
      expected_version: active.version,
      outcome: "cancelled",
    });
  await api("/preferences", { locale: "fr", theme: "light" });
  await api("/sport/settings", {
    workouts_mobile_view: "list",
    exercises_mobile_view: "list",
    measurements_mobile_view: "list",
    rest_seconds: 0,
  });
});
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  const overflow = await page
    .locator(
      ".sport-content input, .sport-content select, dialog[open] input, dialog[open] select",
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
async function visibleRows(rows: Locator, minimum: number, maxTop: number) {
  await expect(rows.first()).toBeVisible();
  await expect
    .poll(() =>
      rows.evaluateAll(
        (elements) =>
          elements.filter((element) => {
            const box = element.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= innerHeight && box.height > 0;
          }).length,
      ),
    )
    .toBeGreaterThanOrEqual(minimum);
  expect((await rows.first().boundingBox())!.y).toBeLessThanOrEqual(maxTop);
}
for (const [width, height] of [
  [320, 568],
  [390, 664],
  [430, 780],
])
  for (const [locale, theme] of [
    ["fr", "light"],
    ["en", "dark"],
  ]) {
    test.describe(`${width}×${height} ${locale} ${theme}`, () => {
      test.use({ viewport: { width, height }, hasTouch: true, isMobile: true });
      test("les données et les actions sont visibles dès l’ouverture de chaque vue", async ({
        page,
      }, info) => {
        test.setTimeout(120_000);
        await api("/preferences", { locale, theme });
        const minimum = width === 320 ? 2 : 3;
        for (const [tab, selector, maxTop] of [
          ["workouts", ".sport-workout", 245],
          ["exercises", ".sport-exercise", 280],
          ["measurements", ".sport-measurement", 245],
          ["history", ".sport-history-row", 240],
        ] as const) {
          await page.goto(`/sport?tab=${tab}`);
          await visibleRows(
            page.locator(selector),
            tab === "history" ? 1 : minimum,
            maxTop,
          );
          await fits(page);
          await page.screenshot({
            path: info.outputPath(`${tab}.png`),
            animations: "disabled",
          });
          if (tab !== "history") {
            for (const button of await page
              .locator(selector)
              .first()
              .getByRole("button")
              .all()) {
              const box = (await button.boundingBox())!;
              expect(box.width).toBeGreaterThanOrEqual(44);
              expect(box.height).toBeGreaterThanOrEqual(44);
            }
            await page
              .getByRole("button", {
                name: locale === "fr" ? "Grille" : "Grid",
                exact: true,
              })
              .click();
            await expect(page.locator("[data-view]")).toHaveAttribute(
              "data-view",
              "grid",
            );
            expect(
              (await page.locator(selector).first().boundingBox())!.y,
            ).toBeLessThan(280);
            await fits(page);
          }
        }
        await page.goto("/sport?tab=statistics");
        const chart = page.locator(".sport-chart").first();
        await expect(chart.locator("svg")).toBeVisible();
        expect((await chart.boundingBox())!.y).toBeLessThan(400);
        const plot = (await chart.locator("svg").boundingBox())!;
        expect(plot.y).toBeLessThan(440);
        if (width > 320) expect(plot.y + plot.height).toBeLessThan(height);
        await fits(page);
        await page.screenshot({
          path: info.outputPath("statistics.png"),
          animations: "disabled",
        });
        await page.goto(`/sport?tab=workouts&program=${programs[0].id}`);
        await expect(page.locator(".sport-plan-entry").first()).toBeVisible();
        const firstField = page.locator(".sport-plan-entry input").first();
        const fieldBox = (await firstField.boundingBox())!;
        expect(fieldBox.y + fieldBox.height).toBeLessThan(height - 8);
        await page
          .getByRole("button", {
            name: locale === "fr" ? "Ajouter un exercice" : "Add an exercise",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("dialog").getByRole("button", {
            name: locale === "fr" ? "Fermer" : "Close",
            exact: true,
          }),
        ).toBeFocused();
        await visibleRows(page.locator(".sport-picker-item"), 3, 190);
        await fits(page);
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("button", {
            name: locale === "fr" ? "Ajouter un exercice" : "Add an exercise",
            exact: true,
          }),
        ).toBeFocused();
        await page.goto("/sport?tab=training");
        await expect(
          page.locator(".sport-empty .primary-button"),
        ).toBeInViewport();
        await api(
          "/sport/sessions",
          { workout_id: programs[0].id, expected_version: programs[0].version },
          "POST",
        );
        await page.reload();
        await visibleRows(page.locator(".sport-set"), 2, 300);
        const firstSet = page.locator(".sport-set").first();
        await expect(
          firstSet.locator(".sport-set-row > button"),
        ).toBeInViewport();
        await firstSet.locator(".sport-set-row > button").click();
        await expect(firstSet).toHaveClass(/is-complete/);
        await fits(page);
        await page.screenshot({
          path: info.outputPath("training.png"),
          animations: "disabled",
        });
        await page.goto(`/sport?tab=history&session=${completed.id}`);
        await expect(page.getByRole("dialog")).toBeVisible();
        await fits(page);
        await page.keyboard.press("Escape");
        await page.goto("/settings?application=sport");
        const rest = page.locator(".sport-settings input");
        await expect(rest).toBeInViewport();
        await page.screenshot({
          path: info.outputPath("settings.png"),
          animations: "disabled",
        });
      });
    });
  }

test.describe("commandes compactes", () => {
  test.use({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    isMobile: true,
  });
  test("filtres conservés, menu au clavier, copie et archivage annulable", async ({
    page,
  }) => {
    await page.goto("/sport");
    const row = page.locator(".sport-workout").filter({
      has: page.getByRole("heading", { name: programs[0].name, exact: true }),
    });
    await openSportActions(row);
    // Measure the settled menu: an opening translation can report 43.99999 px
    // for a 44 px target. Keep the actual 44 px requirement unchanged.
    await expect(page.getByRole("dialog")).toHaveCSS("transform", "none");
    const menu = page.getByRole("dialog").locator(".sport-compact-actions");
    const menuWidth = (await menu.boundingBox())!.width;
    let bottom = 0;
    for (const button of await menu.locator(":scope > button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThan(menuWidth * 0.75);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(bottom);
      bottom = box.y + box.height;
    }
    await page.keyboard.press("Escape");
    await expect(
      row.getByRole("button", { name: `Actions pour ${programs[0].name}` }),
    ).toBeFocused();
    await openSportActions(row);
    await row
      .getByRole("button", {
        name: `Dupliquer « ${programs[0].name} »`,
        exact: true,
      })
      .click();
    const copyName = `${prefix} copie`;
    await page
      .getByRole("dialog")
      .getByLabel("Nom du programme")
      .fill(copyName);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Dupliquer le programme", exact: true })
      .click();
    const copy = page.locator(".sport-workout").filter({
      has: page.getByRole("heading", { name: copyName, exact: true }),
    });
    await openSportActions(copy);
    await copy
      .getByRole("button", { name: `Archiver « ${copyName} »`, exact: true })
      .click();
    await expect(copy).toHaveCount(0);
    await page.getByRole("button", { name: "Annuler l’archivage" }).click();
    await expect(copy).toHaveCount(1);
    await openSportFilters(page);
    await page.getByLabel("Trier les programmes").selectOption("name");
    await page.getByRole("button", { name: /^Filtres/ }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: /^Filtres/ })).toContainText(
      "1",
    );
    await openSportFilters(page);
    await expect(page.getByLabel("Trier les programmes")).toHaveValue("name");
    await page.goto(`/sport?tab=workouts&program=${programs[1].id}`);
    await openProgramOptions(page);
    await expect(page.getByLabel("Notes de préparation")).toHaveValue(
      programs[1].notes,
    );
    await page.locator(".sport-program-options summary").click();
    const last = page.locator(".sport-plan-entry").last();
    const name = (await last.getByRole("heading").innerText()).replace(
      /^\d+\s*/,
      "",
    );
    await openSportActions(last);
    await page
      .getByRole("dialog")
      .getByLabel("Déplacer à la position")
      .selectOption("0");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".sport-plan-entry").first()).toContainText(name);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Tous les programmes" }).click();
    await expect(
      page.getByRole("heading", { name: "Programmes", exact: true }),
    ).toBeVisible();

    await page.goto(`/sport?tab=workouts&program=${programs[1].id}`);
    await page
      .getByRole("button", { name: "Ajouter un exercice", exact: true })
      .click();
    const picker = page.locator(".sport-picker");
    await picker.getByRole("searchbox").fill("rowing");
    await expect(picker.locator(".sport-picker-item").first()).toContainText(
      /rowing/i,
    );
    await picker.getByRole("checkbox").first().check();
    const target = (await picker
      .locator(".sport-picker-check")
      .first()
      .boundingBox())!;
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    await expect(
      picker.getByRole("button", { name: "Ajouter la sélection" }),
    ).toBeInViewport();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Ajouter un exercice", exact: true })
      .click();
    await expect(picker.getByRole("searchbox")).toHaveValue("rowing");
    await expect(picker.getByRole("checkbox", { checked: true })).toHaveCount(
      1,
    );
    await page.keyboard.press("Escape");
  });
  test("relevé compact, détail complet, édition et sauvegarde avec un écran réduit", async ({
    page,
  }) => {
    await page.goto("/sport?tab=measurements");
    const row = page.locator(".sport-measurement").first();
    await row.getByRole("button", { name: /^Relevé du/ }).click();
    const detail = page.getByRole("dialog");
    await expect(detail.locator("dl > div")).toHaveCount(12);
    await expect(detail).toContainText(prefix);
    await detail.getByRole("button", { name: "Modifier", exact: true }).click();
    const form = page.getByRole("dialog");
    await expect(form.getByLabel("Poids (kg)", { exact: true })).toHaveValue(
      "78",
    );
    await form.getByLabel("Poids (kg)", { exact: true }).fill("77.5");
    await page.setViewportSize({ width: 320, height: 360 });
    await form
      .getByRole("button", { name: "Enregistrer les mensurations" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = await api<Measurement>(
      `/sport/measurements/${measurements[0].id}`,
    );
    expect(saved.weight_kg).toBe(77.5);
    expect(saved.neck_cm).toBe(38);
    expect(saved.notes).toBe(prefix);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/sport?tab=exercises");
    await expect(page.locator("[data-view]")).toHaveAttribute(
      "data-view",
      "list",
    );
    await visibleRows(page.locator(".sport-exercise"), 1, 280);
    await fits(page);
  });
});
