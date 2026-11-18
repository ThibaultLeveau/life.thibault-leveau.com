import { test, expect, type BrowserContext } from "@playwright/test";
import fr from "../src/apps/recipes/locales/fr.json" with { type: "json" };
import en from "../src/apps/recipes/locales/en.json" with { type: "json" };

let auth: BrowserContext,
  cookies: Awaited<ReturnType<BrowserContext["cookies"]>>,
  headers: Record<string, string>;
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
for (const [locale, theme, width] of [
  ["fr", "light", 1440],
  ["en", "dark", 320],
  ["fr", "system", 768],
] as const) {
  test(`import review and real atomic save: ${locale} ${theme} ${width}px`, async ({
    page,
  }, info) => {
    const t = locale === "fr" ? fr : en;
    const title = `${locale === "fr" ? "Pâtes au citron" : "Lemon pasta"} ${Date.now()}`;
    await auth.request.put("/api/v1/preferences", {
      headers,
      data: { locale, theme },
    });
    await page.context().addCookies(cookies);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    const browserSource = await page.context().newPage();
    await browserSource.setViewportSize({ width: 1024, height: 720 });
    await browserSource.setContent(
      '<html><body style="margin:0;background:#faf6ed;color:#273d33;padding:60px;font:20px Georgia"><p>THE EVERYDAY TABLE</p><h1 style="font-size:54px">Lemon pasta</h1><p>A little sunshine for your weekday table.</p><button style="padding:20px">Continue to recipe</button><p>200 g pasta · 1 lemon · serves two</p></body></html>',
    );
    const screenshot = (
      await browserSource.screenshot({ type: "jpeg" })
    ).toString("base64");
    await browserSource.close();
    let id = "",
      documentVersion = 1,
      closed = 0,
      interacted = false,
      frameRequests = 0;
    const source = () => ({
      id,
      url: "https://example.com/lemon-pasta",
      title: "Lemon pasta",
      document: documentVersion,
      width: 1024,
      height: 720,
      image: screenshot,
      expires_at: new Date(Date.now() + 600000).toISOString(),
    });
    // Only the external browser and AI boundaries are doubled. Authentication and final save are real.
    await page.route(
      "**/api/v1/recipes/web-import/sessions**",
      async (route) => {
        const request = route.request();
        if (request.method() === "GET" && ++frameRequests === 1) {
          await route.fulfill({
            status: 502,
            json: { detail: "Temporary browser interruption" },
          });
          return;
        }
        if (request.method() === "DELETE") {
          closed++;
          await route.fulfill({ status: 204 });
          return;
        }
        if (request.url().endsWith("/input")) {
          interacted = true;
          await route.fulfill({ json: { ok: true } });
          return;
        }
        if (request.method() === "POST") id = request.postDataJSON().id;
        await route.fulfill({
          status: request.method() === "POST" ? 201 : 200,
          json: source(),
        });
      },
    );
    const importedName = `${locale === "fr" ? "Pâtes de test" : "Test pasta"} ${Date.now()}`;
    let prepared = false;
    await page.route("**/api/v1/recipes/web-import/prepare", async (route) => {
      expect(route.request().postDataJSON()).toEqual({
        session_id: id,
        document: documentVersion,
      });
      prepared = true;
      await route.fulfill({
        json: {
          import_id: crypto.randomUUID(),
          locale,
          title,
          servings: 2,
          instructions:
            locale === "fr"
              ? "Cuire les pâtes. Ajouter le citron."
              : "Boil the pasta. Add lemon.",
          items: [
            {
              ingredient_id: null,
              catalogue_name: null,
              name: importedName,
              quantity: "200",
              unit: "g",
              source_text: "200 g pasta",
              note: "",
            },
          ],
          warnings: [
            locale === "fr"
              ? "Vérifiez la cuisson."
              : "Check the cooking time.",
          ],
          source_url: "https://example.com/lemon-pasta",
          source_title: "Lemon pasta",
        },
      });
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/recipes");
    await page.getByRole("button", { name: t.web_import, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: t.web_headline }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath("import-start.png"),
      fullPage: true,
    });
    await page
      .getByLabel(t.web_url_label, { exact: true })
      .fill("https://example.com/lemon-pasta");
    await page.getByRole("button", { name: t.web_open, exact: true }).click();
    await expect(
      page.getByRole("region", { name: t.web_preview }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: t.web_keyboard, exact: true })
      .click();
    await expect(page.locator(".recipes-web-screen")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect.poll(() => interacted).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: t.web_keyboard, exact: true }),
    ).toBeFocused();
    await expect
      .poll(() => frameRequests, { timeout: 10000 })
      .toBeGreaterThan(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page
      .getByRole("button", { name: t.web_import_action, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: t.web_review_title }),
    ).toBeVisible();
    expect(prepared).toBeTruthy();
    await expect(page.getByLabel(t.title, { exact: true })).toBeFocused();
    expect(
      (
        await page.request.get(
          `/api/v1/recipes/recipes?q=${encodeURIComponent(title)}`,
        )
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await (
          await page.request.get(
            `/api/v1/recipes/recipes?q=${encodeURIComponent(title)}`,
          )
        ).json()
      ).total,
    ).toBe(0);
    await page
      .getByRole("button", { name: t.web_add_ingredient, exact: true })
      .click();
    expect(await page.locator(".recipes-web-ingredient").count()).toBe(2);
    await page
      .locator(".recipes-web-ingredient")
      .last()
      .getByRole("button", {
        name: t.remove.replace("{{name}}", "").trim(),
        exact: true,
      })
      .click();
    await page.getByLabel(t.title, { exact: true }).fill(title + " reviewed");
    await page
      .getByRole("button", { name: t.section_add, exact: true })
      .click();
    const preparationSection = page.locator(".recipes-preparation-section");
    await preparationSection.locator("input").fill("Service");
    await preparationSection
      .locator("textarea")
      .fill("Servir immédiatement.\nBon appétit !");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath("import-review.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: t.web_save, exact: true }).click();
    await expect(page.locator(".recipes-preparation-read")).toContainText(
      "Servir immédiatement.",
    );
    await expect(
      page.getByRole("heading", { name: title + " reviewed", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".recipes-web-source a")).toHaveAttribute(
      "href",
      "https://example.com/lemon-pasta",
    );
    const saved = (
      await (
        await page.request.get(
          `/api/v1/recipes/recipes?q=${encodeURIComponent(title)}`,
        )
      ).json()
    ).items;
    expect(saved).toHaveLength(1);
    expect(saved[0].imported_at).toBeTruthy();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: title + " reviewed", exact: true }),
    ).toBeVisible();
    expect(closed).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test("pasted source, unavailable provider and protected draft", async ({
  page,
}) => {
  await auth.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
  await page.context().addCookies(cookies);
  await page.goto("/recipes?import=web");
  await page.getByText(fr.web_paste_fallback, { exact: true }).click();
  await page
    .getByLabel(fr.web_paste_label, { exact: true })
    .fill(
      "Lemon pasta: 200 g pasta, one lemon. Boil pasta, add lemon. Serves two.",
    );
  await page.route("**/api/v1/recipes/web-import/prepare", (route) =>
    route.fulfill({
      status: 502,
      json: { detail: "Fournisseur momentanément indisponible." },
    }),
  );
  await page
    .getByRole("button", { name: fr.web_import_action, exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Fournisseur momentanément indisponible",
  );
  await expect(
    page.getByLabel(fr.web_paste_label, { exact: true }),
  ).not.toHaveValue("");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator(".recipes-back").click();
  await expect(
    page.getByLabel(fr.web_paste_label, { exact: true }),
  ).toBeVisible();
});
