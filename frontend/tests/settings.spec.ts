import { test, expect, type BrowserContext, type Page } from "@playwright/test";

let auth: BrowserContext;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let headers: Record<string, string>;
const username = process.env.LIFE_E2E_USERNAME ?? "browser-test";
const appNames = {
  tasks: "Tâches",
  sport: "Sport",
  tracking: "Suivi",
  okr: "Objectifs OKR",
  recipes: "Recettes & Liste de courses",
  life_ai: "Life AI",
};
const sectionNav = (page: Page) =>
  page.getByRole("navigation", { name: "Sections des réglages" });

test.beforeAll(async ({ browser }) => {
  auth = await browser.newContext({
    baseURL: process.env.LIFE_E2E_URL ?? "http://127.0.0.1:18106",
  });
  const response = await auth.request.post("/api/v1/auth/session", {
    data: {
      username,
      password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
    },
  });
  expect(response.ok()).toBeTruthy();
  headers = { "X-CSRF-Token": (await response.json()).csrf_token };
  cookies = await auth.cookies();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
  for (const id of Object.keys(appNames))
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
});
test.afterAll(async () => {
  await auth?.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
  await auth?.close();
});

test("menu du nom : clavier, clic extérieur, erreurs et lien Réglages", async ({
  page,
}) => {
  await page.goto("/applications");
  const trigger = page.getByRole("button", { name: username, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Réglages" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Se déconnecter" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitem", { name: "Réglages" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await trigger.click();
  await page
    .getByRole("heading", { name: "Bibliothèque des applications" })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.route("**/api/v1/auth/session", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 503, json: {} })
      : route.continue(),
  );
  await trigger.click();
  await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(trigger).toBeEnabled();
  await page.getByRole("menuitem", { name: "Réglages" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { name: "Général", exact: true }),
  ).toBeVisible();
  await expect(sectionNav(page).getByRole("link")).toHaveCount(7);
});

test("chaque application ouvre sa section et les anciennes URL restent utilisables", async ({
  page,
}) => {
  for (const [id, name] of Object.entries(appNames)) {
    await page.goto(id === "life_ai" ? "/ai" : `/${id}`);
    const sidebar = page.locator(".application-sidebar");
    const link = sidebar.getByRole(
      ["tasks", "recipes", "life_ai"].includes(id) ? "link" : "button",
      { name: "Réglages", exact: true },
    );
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/settings\\?application=${id}$`));
    await expect(page.locator("#settings-section-title")).toHaveText(name);
  }
  for (const id of ["sport", "tracking", "okr"]) {
    await page.goto(`/${id}?tab=settings`);
    await expect(page).toHaveURL(new RegExp(`/settings\\?application=${id}$`));
  }
});

test("préférences métier : sauvegarde et parité API après rechargement", async ({
  page,
}) => {
  await page.goto("/settings?application=sport");
  const rest = page.getByLabel("Temps de repos entre les séries (secondes)");
  await rest.fill("137");
  await page
    .getByRole("button", { name: "Enregistrer les réglages", exact: true })
    .click();
  await expect(
    page.getByText("Réglages enregistrés.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(rest).toHaveValue("137");
  expect(
    (await (await page.request.get("/api/v1/sport/settings")).json())
      .rest_seconds,
  ).toBe(137);
  for (const id of ["tracking", "okr"]) {
    await page.goto(`/settings?application=${id}`);
    await page
      .getByLabel("Fuseau horaire", { exact: true })
      .fill("Europe/London");
    await page
      .locator(".settings-form")
      .getByRole("button", { name: /Enregistrer/ })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /Enregistré|Réglages enregistrés/ }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Fuseau horaire", { exact: true }),
    ).toHaveValue("Europe/London");
    expect(
      (await (await page.request.get(`/api/v1/${id}/settings`)).json())
        .timezone,
    ).toBe("Europe/London");
  }
  const space = await (
    await page.request.post("/api/v1/workspaces", {
      headers,
      data: { name: `Réglages ${Date.now()}` },
    })
  ).json();
  await page.goto("/settings?application=tasks");
  await page.getByLabel("Vue à configurer").selectOption(space.id);
  await page
    .getByRole("combobox", { name: "Densité", exact: true })
    .selectOption("compact");
  await page
    .getByRole("combobox", { name: "Vue des tâches", exact: true })
    .selectOption("board");
  await page
    .locator("form.settings-form")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    page.getByText("Modifications enregistrées.", { exact: true }),
  ).toBeVisible();
  expect(
    await (
      await page.request.get(`/api/v1/workspaces/${space.id}/view`)
    ).json(),
  ).toMatchObject({ density: "compact", layout: "board" });
  await page
    .getByRole("link", { name: "Configurer l’espace", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Configurer l’espace" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("brouillons : sections, précédent, langue, déconnexion et sauvegarde en cours", async ({
  page,
}) => {
  await page.goto("/settings?application=sport");
  await sectionNav(page)
    .getByRole("link", { name: "Suivi", exact: true })
    .click();
  await page.getByLabel("Fuseau horaire", { exact: true }).fill("UTC");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/application=tracking/);
  await expect(page.getByLabel("Fuseau horaire", { exact: true })).toHaveValue(
    "UTC",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await sectionNav(page)
    .getByRole("link", { name: "Général", exact: true })
    .click();
  await expect(page).toHaveURL(/application=tracking/);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.getByRole("button", { name: username, exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
  await expect(page.getByLabel("Fuseau horaire", { exact: true })).toHaveValue(
    "UTC",
  );
  await page.keyboard.press("Escape");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/tracking/settings", async (route) => {
    if (route.request().method() === "PUT") await gate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Enregistrer les réglages", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: username, exact: true }),
  ).toBeDisabled();
  page.once("dialog", (dialog) => dialog.accept());
  await sectionNav(page)
    .getByRole("link", { name: "Sport", exact: true })
    .click();
  await expect(page).toHaveURL(/application=tracking/);
  release();
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
  await sectionNav(page)
    .getByRole("link", { name: "Sport", exact: true })
    .click();
  await expect(page).toHaveURL(/application=sport/);
});

test("erreurs, conflit de version et désactivation retirent les données privées", async ({
  page,
}) => {
  await page.route("**/api/v1/okr/settings", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/settings?application=okr");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/v1/okr/settings");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await page.getByLabel("Fuseau horaire", { exact: true }).fill("UTC");
  const saved = await (await page.request.get("/api/v1/okr/settings")).json();
  expect(
    (
      await page.request.put("/api/v1/okr/settings", {
        headers,
        data: { timezone: "Europe/Paris", expected_version: saved.version },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Fuseau horaire", { exact: true })).toHaveValue(
    "UTC",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Recharger les valeurs enregistrées" })
    .click();
  await expect(page.getByLabel("Fuseau horaire", { exact: true })).toHaveValue(
    "Europe/Paris",
  );
  await page.request.put("/api/v1/applications/okr", {
    headers,
    data: { enabled: false },
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Fuseau horaire", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: /est désactivée/ }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/okr/settings")).status()).toBe(403);
  await page.request.put("/api/v1/applications/okr", {
    headers,
    data: { enabled: true },
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Fuseau horaire", { exact: true })).toHaveValue(
    "Europe/Paris",
  );
  await page.route("**/api/v1/applications", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Connexion", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".settings-content")).toHaveCount(0);
});

test("FR/EN, thèmes, mobile 320 px et bureau", async ({ page }, info) => {
  test.setTimeout(120_000);
  for (const locale of ["fr", "en"])
    for (const theme of ["light", "dark", "system"]) {
      await auth.request.put("/api/v1/preferences", {
        headers,
        data: { locale, theme },
      });
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/settings");
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(
          page.getByRole("heading", {
            name: locale === "fr" ? "Général" : "General",
            exact: true,
          }),
        ).toBeVisible();
        for (const id of ["sport", "tasks", "tracking", "okr", "recipes"]) {
          await page
            .locator(
              `.settings-navigation a[href="/settings?application=${id}"]`,
            )
            .click();
          await expect(
            page.locator(`.settings-navigation a[aria-current="page"]`),
          ).toHaveAttribute("href", `/settings?application=${id}`);
          await expect(
            page.locator(".progression-settings input[type=checkbox]").first(),
          ).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBeTruthy();
        }
        await page.getByRole("button", { name: username, exact: true }).click();
        await expect(
          page.getByRole("menuitem", {
            name: locale === "fr" ? "Réglages" : "Settings",
            exact: true,
          }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBeTruthy();
        if (theme === "dark")
          await page.screenshot({
            path: info.outputPath(`settings-${locale}-${width}.png`),
            fullPage: true,
          });
        await page.keyboard.press("Escape");
      }
    }
});

test("Général : préférences API, calendrier indépendant de Suivi et accès authentifié", async ({
  page,
  browser,
}) => {
  await auth.request.put("/api/v1/applications/tracking", {
    headers,
    data: { enabled: false },
  });
  const before = await (
    await page.request.get("/api/v1/progression/settings")
  ).json();
  await page.goto("/settings");
  const content = page.getByRole("main");
  await content
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await content
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  expect(await (await page.request.get("/api/v1/preferences")).json()).toEqual({
    theme: "dark",
    locale: "en",
  });
  await page
    .locator(".progression-settings input[list]")
    .fill(before.timezone === "UTC" ? "Europe/Paris" : "UTC");
  await page
    .getByRole("button", { name: "Save my rhythm", exact: true })
    .click();
  await expect(
    page.getByText("Your rhythm has been saved.", { exact: true }),
  ).toBeVisible();
  const after = await (
    await page.request.get("/api/v1/progression/settings")
  ).json();
  expect(after.timezone).not.toBe(before.timezone);
  expect(after.usage_days).toEqual(before.usage_days);
  expect(after.vacations).toEqual(before.vacations);
  const guest = await browser.newContext();
  const anonymous = await guest.newPage();
  await anonymous.goto(
    `${process.env.LIFE_E2E_URL ?? "http://127.0.0.1:18106"}/settings?application=sport`,
  );
  await expect(anonymous.locator(".auth-page")).toBeVisible();
  await expect(anonymous.locator(".settings-content")).toHaveCount(0);
  await guest.close();
  await auth.request.put("/api/v1/applications/tracking", {
    headers,
    data: { enabled: true },
  });
});
