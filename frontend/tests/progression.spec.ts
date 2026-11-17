import { test, expect, type BrowserContext, type Page } from "@playwright/test";
let auth: BrowserContext;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let headers: Record<string, string>;
let spaceId: string;
const taskName = `Progression ${Date.now()}`;
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
  for (const id of ["tasks", "sport", "okr", "recipes", "tracking"])
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
  const settings = await (
    await auth.request.get("/api/v1/progression/settings")
  ).json();
  expect(
    (
      await auth.request.put("/api/v1/progression/settings", {
        headers,
        data: {
          expected_version: settings.version,
          timezone: "Europe/Paris",
          exclude_weekends: {},
          usage_days: {},
          vacations: [],
        },
      })
    ).ok(),
  ).toBeTruthy();
  const space = await auth.request.post("/api/v1/workspaces", {
    headers,
    data: { name: taskName },
  });
  expect(space.ok()).toBeTruthy();
  spaceId = (await space.json()).id;
  expect(
    (
      await auth.request.post("/api/v1/tasks", {
        headers,
        data: { workspace_id: spaceId, title: taskName },
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
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
}

test("Les actions mettent à jour le badge ; les points et quêtes concordent avec l’API", async ({
  page,
}) => {
  await page.goto(`/tasks?space=${spaceId}`);
  const before = await (
    await page.request.get("/api/v1/progression/tasks")
  ).json();
  await page
    .getByRole("checkbox", { name: `Terminer : ${taskName}`, exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/progression/tasks")).json()).xp,
    )
    .toBeGreaterThan(before.xp);
  const after = await (
    await page.request.get("/api/v1/progression/tasks")
  ).json();
  await expect(page.locator(".progression-level-number")).toHaveText(
    String(after.level),
  );
  const badge = page.locator(".progression-badge");
  await badge.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Votre progression" }),
  ).toBeVisible();
  await expect(page.locator(".progression-quest-preview")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(badge).toBeFocused();
  await badge.click();
  await page.getByRole("link", { name: "Explorer les réussites" }).click();
  await expect(page).toHaveURL(/application=tasks/);
  await expect(page.locator(".progression-quest-card")).toHaveCount(60);
  await expect(page.locator(".progression-hero")).toContainText(after.title);
  await page.getByRole("button", { name: "Accomplies", exact: true }).click();
  await expect(page.locator(".progression-quest-card")).toHaveCount(
    after.quests_earned,
  );
  await page.getByRole("button", { name: "Toutes", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Rechercher une quête" })
    .fill("introuvableabc");
  await expect(page.getByText("Aucune quête pour ces filtres.")).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await expect(page.locator(".progression-quest-card")).toHaveCount(60);
  await page.locator(".progression-titles summary").click();
  await expect(page.locator(".progression-titles li")).toHaveCount(10);
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/progression-desktop.png",
    fullPage: false,
  });
});

test("Jours par application et vacances : clavier, garde du brouillon et persistance", async ({
  page,
}) => {
  await page.goto("/tracking?tab=settings");
  const tasks = page.getByRole("group", { name: "Tâches", exact: true });
  const saturday = tasks.getByRole("checkbox", { name: "samedi", exact: true });
  await saturday.focus();
  await page.keyboard.press("Space");
  await expect(saturday).not.toBeChecked();
  await tasks.getByRole("checkbox", { name: "dimanche", exact: true }).uncheck();
  const tracking = page.getByRole("group", { name: "Suivi", exact: true });
  for (const name of ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"])
    await tracking.getByRole("checkbox", { name, exact: true }).uncheck();
  await expect(tracking.getByRole("checkbox", { name: "dimanche", exact: true })).toBeDisabled();
  await expect(tracking).toContainText("1 jour prévu par semaine");
  const sport = page.getByRole("group", { name: "Sport", exact: true });
  for (const name of ["mardi", "jeudi", "samedi", "dimanche"])
    await sport.getByRole("checkbox", { name, exact: true }).uncheck();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .locator(".application-sidebar")
    .getByRole("button", { name: "Réussites", exact: true })
    .click();
  await expect(page).toHaveURL(/tab=settings/);
  await page
    .getByRole("button", { name: "Partir en vacances aujourd’hui" })
    .click();
  await page.getByRole("button", { name: "Enregistrer mon rythme" }).click();
  await expect(page.getByText("Votre rythme est enregistré.")).toBeVisible();
  await page.reload();
  await expect(saturday).not.toBeChecked();
  await expect(tracking.getByRole("checkbox", { checked: true })).toHaveCount(1);
  await expect(page.getByText("Mode vacances actif")).toBeVisible();
  const settings = await (
    await page.request.get("/api/v1/progression/settings")
  ).json();
  expect(settings.usage_days.tasks).toEqual([0, 1, 2, 3, 4]);
  expect(settings.usage_days.sport).toEqual([0, 2, 4]);
  expect(settings.usage_days.tracking).toEqual([6]);
  expect(settings.vacations).toHaveLength(1);
  for (const id of ["tasks", "sport", "okr", "recipes", "tracking"])
    expect(
      (await (await page.request.get(`/api/v1/progression/${id}`)).json())
        .paused_today,
    ).toBe(true);
  await page
    .getByRole("button", { name: "Terminer les vacances aujourd’hui" })
    .click();
  await page.getByRole("button", { name: "Enregistrer mon rythme" }).click();
  await expect(page.getByText("Votre rythme est enregistré.")).toBeVisible();
  await page.locator(".progression-badge").click();
  await expect(page.locator(".progression-popover")).toContainText("Jours prévus : dim.");
  await page.keyboard.press("Escape");
  await noOverflow(page);
  await page.screenshot({ path: "test-results/progression-schedules-desktop.png", fullPage: true });
});

test("Parité mobile 320 px et bureau, FR/EN et thèmes ; séries conservées après désactivation", async ({
  page,
}) => {
  for (const locale of ["fr", "en"])
    for (const theme of ["light", "dark", "system"]) {
      await auth.request.put("/api/v1/preferences", {
        headers,
        data: { locale, theme },
      });
      await page.setViewportSize({ width: 320, height: 820 });
      for (const id of ["tasks", "sport", "okr", "recipes", "tracking"]) {
        await page.goto(
          `/${id}${id === "tracking" ? "?tab=achievements&application=tracking" : ""}`,
        );
        const badge = page.locator(".progression-badge");
        await expect(badge).toBeVisible();
        await badge.click();
        await expect(page.locator(".progression-popover")).toBeVisible();
        await noOverflow(page);
        await page.keyboard.press("Escape");
        await expect(badge).toBeFocused();
      }
      await expect(page.locator(".progression-quest-card")).toHaveCount(60);
      await noOverflow(page);
      if (theme === "dark")
        await page.screenshot({
          path: `test-results/progression-mobile-${locale}.png`,
          fullPage: false,
        });
      await page.goto("/tracking?tab=settings");
      const tracking = page.getByRole("group", { name: locale === "fr" ? "Suivi" : "Tracking", exact: true });
      await expect(tracking.getByRole("checkbox", { checked: true })).toHaveCount(1);
      const sunday = tracking.getByRole("checkbox", { name: locale === "fr" ? "dimanche" : "Sunday", exact: true });
      await expect(sunday).toBeChecked();
      await noOverflow(page);
      const targets = await tracking.locator("label").evaluateAll((labels) =>
        labels.every((label) => label.getBoundingClientRect().height >= 44 && label.getBoundingClientRect().width >= 44));
      expect(targets).toBeTruthy();
      if (theme === "dark")
        await page.screenshot({ path: `test-results/progression-schedules-mobile-${locale}.png`, fullPage: true });
    }
  const before = await (
    await auth.request.get("/api/v1/progression/tasks")
  ).json();
  await auth.request.put("/api/v1/applications/tasks", {
    headers,
    data: { enabled: false },
  });
  expect(
    (await auth.request.get("/api/v1/progression/tasks/history")).status(),
  ).toBe(403);
  await page.goto("/tracking?tab=achievements");
  await expect(page.locator(".progression-app-picker button")).toHaveCount(4);
  await expect(
    page
      .locator(".progression-app-picker")
      .getByRole("button", { name: /OKR Goals/ }),
  ).toBeVisible();
  await auth.request.put("/api/v1/applications/tasks", {
    headers,
    data: { enabled: true },
  });
  expect(
    (await (await auth.request.get("/api/v1/progression/tasks")).json()).xp,
  ).toBe(before.xp);
  expect(
    (await (await auth.request.get("/api/v1/progression/tasks")).json()).usage_days,
  ).toEqual(before.usage_days);
  await auth.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test("Erreur du badge récupérable et données privées démontées à expiration", async ({
  page,
}) => {
  await page.route("**/api/v1/progression/tasks", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"detail":"unavailable"}',
    }),
  );
  await page.goto("/tasks");
  await page.locator(".progression-badge").click();
  await expect(
    page.locator(".progression-popover").getByRole("alert"),
  ).toBeVisible();
  await page.unroute("**/api/v1/progression/tasks");
  await page
    .locator(".progression-popover")
    .getByRole("button", { name: "Réessayer", exact: true })
    .click();
  await expect(page.locator(".progression-quest-preview")).toHaveCount(3);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("life-session-expired")),
  );
  await expect(page.locator(".progression-widget")).toHaveCount(0);
  await expect(page.locator(".progression-quest-preview")).toHaveCount(0);
});
