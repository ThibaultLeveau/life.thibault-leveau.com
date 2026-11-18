import { expect, test } from "@playwright/test";

const guides = [
  { id: "general", path: "applications", pages: ["applications", "assistant", "settings", "progression"], query: ["applications", "applications"] },
  { id: "tasks", path: "taches", pages: ["taches"], query: ["récurrence", "recurrence"] },
  { id: "sport", path: "sport", pages: ["sport"], query: ["HYROX", "HYROX"] },
  { id: "tracking", path: "tracking", pages: ["tracking"], query: ["calendrier", "calendar"] },
  { id: "okr", path: "okr", pages: ["okr"], query: ["trimestriel", "quarterly"] },
  { id: "recipes", path: "recipes", pages: ["recipes"], query: ["portions", "servings"] },
  { id: "technical", path: "technique", pages: [], query: ["PostgreSQL", "PostgreSQL"] },
];
const userPages = guides.filter((guide) => guide.id !== "technical").flatMap((guide) => guide.pages);

for (const [index, locale] of ["fr", "en"].entries()) {
  const prefix = `/documentation/${locale === "en" ? "en/" : ""}`;
  for (const guide of guides) {
    test(`${locale}: ${guide.id} has independent navigation, search and screenshots`, async ({ page, request }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(`${prefix}${guide.path}/`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const toolbar = page.locator(".guide-toolbar");
      await expect(toolbar).toHaveAttribute("data-guide", guide.id);
      await expect(toolbar).toHaveAttribute("data-guide-locale", locale);
      const checkScope = (hrefs: string[]) => {
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) {
          const path = new URL(href).pathname;
          expect(path.startsWith(prefix)).toBe(true);
          const relative = path.slice(prefix.length).replace(/\/$/, "");
          if (guide.id === "technical") {
            expect(relative.startsWith("en/")).toBe(false);
            expect(userPages).not.toContain(relative);
            expect(relative).not.toBe("");
          } else expect(guide.pages).toContain(relative);
        }
      };
      checkScope(await page.locator(".md-nav--primary a.md-nav__link").evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href)));
      const images = page.locator(".md-content img[src*='/screenshots/']");
      expect(await images.count()).toBeGreaterThan(0);
      for (const image of await images.all()) {
        await expect(image).toHaveAttribute("alt", /\S+/);
        const src = await image.evaluate((element) => (element as HTMLImageElement).src);
        expect(src).toContain(`/screenshots/${locale}/`);
        const imageResponse = await request.get(src);
        expect(imageResponse.status()).toBe(200);
        expect(imageResponse.headers()["content-type"]).toContain("image/png");
      }
      const search = page.locator(".md-search__input");
      await expect(search).toHaveAttribute("placeholder", locale === "fr" ? "Rechercher" : "Search");
      await search.focus();
      await expect(page.locator(".md-search-result__meta")).toHaveText(
        locale === "fr" ? "Taper pour démarrer la recherche" : "Type to start searching",
      );
      await search.pressSequentially(guide.query[index]);
      const result = page.locator(".md-search-result__link");
      await expect(result.first()).toBeVisible();
      checkScope(await result.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href)));
      await result.first().click();
      await expect(page.locator(".guide-toolbar")).toHaveAttribute("data-guide", guide.id);
      await expect(page.locator(".guide-toolbar")).toHaveAttribute("data-guide-locale", locale);
      await page.goto(`${prefix}${guide.path}/`);
      await toolbar.locator("a[hreflang]").click();
      await expect(page).toHaveURL(new RegExp(`/documentation/${locale === "fr" ? "en/" : ""}${guide.path}/$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "fr" ? "en" : "fr");
      expect(errors).toEqual([]);
    });
  }
  test(`${locale}: directory and mobile keyboard navigation`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(prefix);
    const links = page.locator(".guide-cards a, .md-content a.md-button");
    await expect(links).toHaveCount(7);
    for (const link of await links.all()) await expect(link).toHaveAttribute("href", /\S+/);
    await page.goto(`${prefix}technique/`);
    await expect(page.locator(".guide-toolbar")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const menu = page.locator('.md-header label[for="__drawer"]');
    await menu.click();
    await expect(page.locator("#__drawer")).toBeChecked();
    await page.locator('.md-nav--primary label.md-nav__link').filter({ hasText: locale === "fr" ? "Développer" : "Development" }).first().click();
    const gettingStarted = page.locator('.md-nav--primary a[href$="demarrage/"]');
    await gettingStarted.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${prefix}demarrage/$`));
    await expect(page.locator("#__drawer")).not.toBeChecked();
    await page.locator('.guide-toolbar a[hreflang]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", locale === "fr" ? "en" : "fr");
    await page.locator(".guide-toolbar a").first().click();
    await expect(page.locator(".guide-toolbar")).toHaveAttribute("data-guide", "directory");
  });
}

for (const locale of ["fr", "en"]) {
  test(`${locale}: settings, assistant and their decisions belong to the appropriate guides`, async ({ page }) => {
    for (const [path, guide] of [
      ["settings", "general"],
      ["assistant", "general"],
      ["assistant-api", "technical"],
      ["decisions/007-reglages-generaux", "technical"],
      ["decisions/008-assistant-ia", "technical"],
    ]) {
      await page.goto(`/documentation/${locale === "en" ? "en/" : ""}${path}/`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator(".guide-toolbar")).toHaveAttribute("data-guide", guide);
      await page.locator(".guide-toolbar a[hreflang]").click();
      await expect(page).toHaveURL(new RegExp(`/documentation/${locale === "fr" ? "en/" : ""}${path}/$`));
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "fr" ? "en" : "fr");
      await expect(page.locator(".guide-toolbar")).toHaveAttribute("data-guide", guide);
    }
  });
}
