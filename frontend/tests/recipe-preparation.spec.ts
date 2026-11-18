import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Locator,
} from "@playwright/test";
import fr from "../src/apps/recipes/locales/fr.json" with { type: "json" };
import en from "../src/apps/recipes/locales/en.json" with { type: "json" };

let auth: BrowserContext,
  cookies: Awaited<ReturnType<BrowserContext["cookies"]>>,
  headers: Record<string, string>;
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
  expect(
    (
      await auth.request.put("/api/v1/applications/recipes", {
        headers,
        data: { enabled: true },
      })
    ).ok(),
  ).toBeTruthy();
});
test.afterAll(async () => {
  await auth?.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
  await auth?.close();
});
async function seed(page: Page, instructions: string) {
  await page.context().addCookies(cookies);
  const ingredient = (
    await (await auth.request.get("/api/v1/recipes/ingredients?limit=1")).json()
  ).items[0];
  const response = await auth.request.post("/api/v1/recipes/recipes", {
    headers,
    data: {
      title: `Preparation ${Date.now()}`,
      instructions,
      items: [{ ingredient_id: ingredient.id, quantity: "1", unit: "g" }],
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
for (const [locale, theme, width] of [
  ["fr", "light", 1440],
  ["en", "dark", 320],
  ["fr", "system", 390],
] as const) {
  test.describe(`${locale} ${theme} ${width}px`, () => {
    test.use({
      viewport: { width, height: 900 },
      hasTouch: width < 800,
      isMobile: width < 800,
    });
    test("split, reorder, remove, retry and persist titled preparation", async ({
      page,
    }, info) => {
      const t = locale === "fr" ? fr : en;
      await auth.request.put("/api/v1/preferences", {
        headers,
        data: { locale, theme },
      });
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      const recipe = await seed(
        page,
        "Préparer.\nCuire doucement.\nServir chaud.",
      );
      await page.goto(`/recipes?id=${recipe.id}&edit=1`);
      const preparation = page.getByLabel(t.instructions, { exact: true });
      await preparation.focus();
      await preparation.evaluate((field: HTMLTextAreaElement) =>
        field.setSelectionRange(10, 10),
      );
      await page
        .getByRole("button", { name: t.section_split, exact: true })
        .click();
      const sections = page.locator(".recipes-preparation-section");
      await expect(sections).toHaveCount(1);
      await expect(sections.first().locator("input")).toBeFocused();
      await sections.first().locator("input").fill("Cuisson");
      await expect(preparation).toHaveValue("Préparer.\n");
      await expect(sections.first().locator("textarea")).toHaveValue(
        "Cuire doucement.\nServir chaud.",
      );
      await sections.first().locator("textarea").focus();
      await sections
        .first()
        .locator("textarea")
        .evaluate((field: HTMLTextAreaElement) =>
          field.setSelectionRange(17, 17),
        );
      await sections
        .first()
        .getByRole("button", { name: t.section_split })
        .click();
      await sections.nth(1).locator("input").fill("Service");
      await sections
        .nth(1)
        .getByRole("button", { name: t.section_up.replace("{{count}}", "2") })
        .click();
      await expect(sections.first().locator("input")).toHaveValue("Service");
      await expect(sections.first().locator("input")).toBeFocused();
      await page
        .getByRole("button", { name: t.section_add, exact: true })
        .click();
      await sections.nth(2).locator("input").fill("À retirer");
      page.once("dialog", (dialog) => dialog.dismiss());
      await sections
        .nth(2)
        .getByRole("button", {
          name: t.section_remove.replace("{{count}}", "3"),
        })
        .click();
      await expect(sections).toHaveCount(3);
      page.once("dialog", (dialog) => dialog.accept());
      await sections
        .nth(2)
        .getByRole("button", {
          name: t.section_remove.replace("{{count}}", "3"),
        })
        .click();
      await expect(sections).toHaveCount(2);
      await expect(sections.nth(1).locator("input")).toBeFocused();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: info.outputPath("preparation-editor.png"),
        fullPage: true,
      });
      const endpoint = `**/api/v1/recipes/recipes/${recipe.id}`;
      await page.route(endpoint, (route) =>
        route.request().method() === "PUT"
          ? route.fulfill({
              status: 503,
              json: { detail: "Retry preparation save" },
            })
          : route.continue(),
      );
      await page.getByRole("button", { name: t.save, exact: true }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(sections.first().locator("textarea")).toHaveValue(
        "Servir chaud.",
      );
      await page.unroute(endpoint);
      await page.getByRole("button", { name: t.save, exact: true }).click();
      await expect(page.locator(".recipes-preparation-read")).toHaveCount(2);
      await page.reload();
      const saved = await (
        await page.request.get(`/api/v1/recipes/recipes/${recipe.id}`)
      ).json();
      expect(saved.instructions).toBe("Préparer.");
      expect(saved.sections).toEqual([
        { title: "Service", text: "Servir chaud." },
        { title: "Cuisson", text: "Cuire doucement." },
      ]);
      await expect(page.locator(".recipes-preparation-read h3")).toHaveText([
        "Service",
        "Cuisson",
      ]);
      await page.screenshot({
        path: info.outputPath("preparation-detail.png"),
        fullPage: true,
      });
    });
  });
}

test.describe("mobile keyboard", () => {
  test.use({
    viewport: { width: 320, height: 700 },
    isMobile: true,
    hasTouch: true,
  });
  test("typing and pasting keep the field and caret above a shrinking/panning keyboard", async ({
    page,
  }, info) => {
    await auth.request.put("/api/v1/preferences", {
      headers,
      data: { locale: "fr", theme: "light" },
    });
    await page.addInitScript(() => {
      const viewport = Object.assign(new EventTarget(), {
        height: 700,
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
        viewport.dispatchEvent(new Event("scroll"));
      });
    });
    const viewport = (height: number, offsetTop = 0) =>
      page.evaluate(
        (detail) =>
          window.dispatchEvent(new CustomEvent("test-viewport", { detail })),
        { height, offsetTop },
      );
    const recipe = await seed(
      page,
      "Une ligne de préparation assez longue pour revenir à la ligne.\n".repeat(
        60,
      ),
    );
    await page.goto(`/recipes?id=${recipe.id}&edit=1`);
    const field = page.getByLabel("Préparation", { exact: true });
    await field.focus();
    await viewport(340, 35);
    async function visible(input: Locator, height: number, top: number) {
      await expect
        .poll(async () =>
          input
            .evaluate((el) => {
              const rect = el.getBoundingClientRect();
              return [
                rect.top,
                rect.bottom,
                window.visualViewport!.offsetTop,
                window.visualViewport!.height,
              ];
            })
            .then(([a, b]) => a >= top + 16 - 1 && b <= top + height - 32 + 1),
        )
        .toBeTruthy();
    }
    await visible(field, 340, 35);
    await page.keyboard.press("ControlOrMeta+End");
    for (let i = 0; i < 10; i++) {
      await page.keyboard.type(`Etape ${i}.`);
      await page.keyboard.press("Enter");
    }
    await visible(field, 340, 35);
    expect(
      await field.evaluate((el: HTMLTextAreaElement) => el.scrollTop),
    ).toBeGreaterThan(100);
    expect(
      await field.evaluate(
        (el: HTMLTextAreaElement) =>
          el.scrollHeight - el.scrollTop - el.clientHeight,
      ),
    ).toBeLessThan(35);
    await field.evaluate((el: HTMLTextAreaElement) => {
      el.setSelectionRange(100, 100);
      el.dispatchEvent(new Event("select", { bubbles: true }));
    });
    await page.keyboard.insertText("INSERTION AU MILIEU");
    await visible(field, 340, 35);
    expect(
      (await field.inputValue()).slice(100, 100 + "INSERTION AU MILIEU".length),
    ).toBe("INSERTION AU MILIEU");
    expect(
      await field.evaluate((el: HTMLTextAreaElement) => el.scrollTop),
    ).toBeLessThan(200);
    // Deliberate scrolling wins; the next keystroke resumes following the field.
    await page.locator("body").dispatchEvent("touchmove");
    await page.evaluate(() => window.scrollBy(0, -120));
    const manualScroll = await page.evaluate(() => window.scrollY);
    await viewport(340, 35);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await page.evaluate(() => window.scrollY)).toBe(manualScroll);
    await page.keyboard.type(" suite");
    await visible(field, 340, 35);
    // Clipboard insertion is equivalent to a native input event, not Locator.fill scrolling the page.
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("Texte collé.\n".repeat(80));
    await visible(field, 340, 35);
    await page.screenshot({
      path: info.outputPath("keyboard-visible-field.png"),
    });
    await page.setViewportSize({ width: 700, height: 320 });
    await viewport(220, 40);
    await page.keyboard.type("Suite en paysage.");
    await visible(field, 220, 40);
    const content = await field.inputValue();
    await viewport(320);
    await field.blur();
    await expect(field).toHaveValue(content);
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(page.locator(".recipes-detail-grid")).toBeVisible();
    expect(
      (
        await (
          await page.request.get(`/api/v1/recipes/recipes/${recipe.id}`)
        ).json()
      ).instructions,
    ).toBe(content.trim());
  });
});
