import { expect, test, type Page } from "@playwright/test";

const applications = [
  {
    path: "/tracking",
    name: "Suivi",
    document: "tracking",
    current: "Aujourd’hui",
  },
  { path: "/tasks", name: "Tâches", document: "taches", current: "À venir" },
  { path: "/sport", name: "Sport", document: "sport", current: "Programmes" },
];
let headers: Record<string, string>;
test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/v1/auth/session", {
    data: {
      username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
      password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
    },
  });
  expect(login.ok()).toBeTruthy();
  headers = { "X-CSRF-Token": (await login.json()).csrf_token };
  for (const id of ["tasks", "sport", "tracking"])
    expect(
      (
        await page.request.put(`/api/v1/applications/${id}`, {
          headers,
          data: { enabled: true },
        })
      ).ok(),
    ).toBeTruthy();
  expect(
    (
      await page.request.put("/api/v1/preferences", {
        headers,
        data: { theme: "light", locale: "fr" },
      })
    ).ok(),
  ).toBeTruthy();
});

async function openNavigation(page: Page) {
  if (page.viewportSize()!.width <= 800)
    await page
      .getByRole("button", { name: /^(Ouvrir la navigation|Open navigation)$/ })
      .click();
  const sidebar = page.locator(".application-sidebar");
  await expect(sidebar).toBeVisible();
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())!.x))
    .toBe(0);
}

async function navigationStyles(page: Page) {
  return page.evaluate(() =>
    [
      ".application-sidebar",
      ".application-sidebar-top",
      ".application-sidebar-label",
      ".application-topbar",
      ".application-sidebar-footer",
      ".application-sidebar-footer .account-menu",
      ".application-sidebar-footer .theme-select",
      ".application-sidebar-footer .account-name",
      ".application-sidebar-footer .icon-button",
      ".application-sidebar-footer a",
      ".application-sidebar-links [aria-current=page]",
    ].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector)!);
      return Object.fromEntries(
        [
          "background-color",
          "color",
          "font-family",
          "font-size",
          "font-weight",
          "line-height",
          "padding",
          "border",
          "border-radius",
          "gap",
          "min-height",
          "display",
          "position",
          ...(selector === ".application-sidebar" ? ["width"] : []),
          ...(selector === ".application-topbar" ? ["height"] : []),
        ].map((property) => [property, style.getPropertyValue(property)]),
      );
    }),
  );
}

test("navigation identique entre applications, thèmes et formats", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  for (const theme of ["light", "dark"]) {
    await page.request.put("/api/v1/preferences", { headers, data: { theme } });
    for (const width of [1440, 1000, 800, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      let reference: Awaited<ReturnType<typeof navigationStyles>> | undefined;
      for (const app of applications) {
        await page.goto(app.path);
        await expect(
          page.getByRole("heading", { name: app.current, exact: true }),
        ).toBeVisible();
        const topbar = page.locator(".application-topbar");
        await expect(topbar).toContainText(app.name);
        await expect(topbar).not.toContainText(
          process.env.LIFE_E2E_USERNAME ?? "browser-test",
        );
        await expect(
          topbar.getByRole("button", {
            name: /Actualiser|Refresh|Recharger|Reload/,
          }),
        ).toHaveCount(0);
        await openNavigation(page);
        const footer = page.locator(".application-sidebar-footer");
        await expect(footer.getByRole("link")).toHaveText([
          "Bibliothèque des applications",
          "Documentation",
        ]);
        await expect(
          footer.getByRole("link", { name: "Documentation", exact: true }),
        ).toHaveAttribute("href", `/documentation/${app.document}/`);
        const styles = await navigationStyles(page);
        if (reference) expect(styles).toEqual(reference);
        reference = styles;
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        if (width === 1440 || width === 320)
          await page.screenshot({
            path: testInfo.outputPath(`${app.document}-${theme}-${width}.png`),
            animations: "disabled",
          });
      }
    }
  }
});

for (const app of applications) {
  test(`${app.name} : footer mobile, préférences API, documentation et déconnexion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(app.path);
    await openNavigation(page);
    const footer = page.locator(".application-sidebar-footer");
    for (const theme of ["dark", "system", "light"]) {
      await footer
        .getByRole("combobox", { name: "Apparence", exact: true })
        .selectOption(theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(
        await (await page.request.get("/api/v1/preferences")).json(),
      ).toEqual({ theme, locale: "fr" });
    }
    await footer
      .getByRole("combobox", { name: "Langue", exact: true })
      .selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await openNavigation(page);
    await expect(
      footer.getByRole("combobox", { name: "Language", exact: true }),
    ).toHaveValue("en");
    await expect(
      footer.getByRole("link", { name: "Documentation", exact: true }),
    ).toHaveAttribute("href", `/documentation/en/${app.document}/`);
    const documentation = await footer
      .getByRole("link", { name: "Documentation", exact: true })
      .getAttribute("href");
    expect((await page.request.get(documentation!)).ok()).toBeTruthy();
    await footer
      .getByRole("link", { name: "Application library", exact: true })
      .click();
    await expect(page).toHaveURL(/\/applications$/);
    await page.goto(app.path);
    await openNavigation(page);
    await footer
      .getByRole("combobox", { name: "Language", exact: true })
      .selectOption("fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await openNavigation(page);
    await footer
      .getByRole("button", { name: "Se déconnecter", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Connexion", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".application-sidebar")).toHaveCount(0);
    expect((await page.request.get("/api/v1/applications")).status()).toBe(401);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
}

test("menu mobile : focus, Échap, fond et passage au bureau", async ({
  page,
}) => {
  for (const app of applications) {
    await page.setViewportSize({ width: 320, height: 812 });
    await page.goto(app.path);
    const opener = page.getByRole("button", {
      name: "Ouvrir la navigation",
      exact: true,
    });
    await opener.focus();
    await page.keyboard.press("Enter");
    const sidebar = page.getByRole("dialog");
    const close = sidebar.getByRole("button", {
      name: "Fermer la navigation",
      exact: true,
    });
    await expect(close).toBeFocused();
    await expect(opener).toHaveAttribute("aria-expanded", "true");
    expect(
      await page
        .locator("main")
        .evaluate((node) => (node as HTMLElement).inert),
    ).toBe(true);
    await sidebar
      .getByRole("button", { name: "Se déconnecter", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(
      sidebar.getByRole("link", { name: "LifeOS, accueil", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      sidebar.getByRole("button", { name: "Se déconnecter", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    await expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(
      await page
        .locator("main")
        .evaluate((node) => (node as HTMLElement).inert),
    ).toBe(false);
    await opener.click();
    await page
      .locator(".application-nav-scrim")
      .click({ position: { x: 315, y: 100 } });
    await expect(opener).toBeFocused();
    await opener.click();
    await page.setViewportSize({ width: 1000, height: 812 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      await page
        .locator("main")
        .evaluate((node) => (node as HTMLElement).inert),
    ).toBe(false);
    await expect(page.locator(".application-sidebar")).toBeVisible();
    await page.setViewportSize({ width: 320, height: 812 });
    await expect(page.locator(".application-sidebar")).not.toBeVisible();
    await opener.click();
    await sidebar
      .getByRole("button", { name: app.current, exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: app.current, exact: true }),
    ).toBeVisible();
  }
});
