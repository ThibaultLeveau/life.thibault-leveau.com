import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { Training, Workout } from "../src/apps/sport/types";

test.use({ timezoneId: "Europe/Paris" });
let auth: BrowserContext;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let headers: Record<string, string>;
test.beforeAll(async ({ browser }) => {
  auth = await browser.newContext({ baseURL: process.env.LIFE_E2E_URL ?? "http://127.0.0.1:18106" });
  const response = await auth.request.post("/api/v1/auth/session", { data: {
    username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
    password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
  } });
  expect(response.ok()).toBeTruthy();
  headers = { "X-CSRF-Token": (await response.json()).csrf_token };
  cookies = await auth.cookies();
});
test.afterAll(async () => { await auth?.close(); });
async function write<T>(page: Page, path: string, data: unknown, method = "PUT"): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, { method, headers, data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
  await write(page, "/applications/sport", { enabled: true });
  const active: Training | null = await (await page.request.get("/api/v1/sport/sessions/active")).json();
  if (active) await write(page, `/sport/sessions/${active.id}/finish`, {
    expected_version: active.version, outcome: "cancelled",
  });
});
async function readable(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  // Unframed space must blend into the page, including between exercise cards.
  const pagePaper = await page.locator(".sport-shell").evaluate((shell) => getComputedStyle(shell).backgroundColor);
  for (const layout of await page.locator(".sport-training, .sport-program-form, .sport-program-actions").all()) {
    await expect(layout).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const inheritedPaper = await layout.evaluate((el) => {
      const sample = document.createElement("span");
      sample.style.backgroundColor = "var(--ui-paper)";
      el.append(sample);
      const color = getComputedStyle(sample).backgroundColor;
      sample.remove();
      return color;
    });
    expect(inheritedPaper).toBe(pagePaper);
  }
  for (const card of await page.locator(".sport-hyrox .sport-plan-entry, .sport-hyrox .sport-session-exercise").all()) {
    const color = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
    const channels = color.match(/\d+/g)!.map(Number);
    expect(channels[0]).toBe(channels[1]);
    expect(channels[1]).toBe(channels[2]);
    expect(color).not.toBe(pagePaper);
  }
  const problems = await page.locator(".sport-hyrox input, .sport-hyrox textarea").evaluateAll((fields) => {
    function luminance(color: string) {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => {
        v /= 255;
        return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      });
      return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    }
    return fields.filter((field) => {
      const box = field.getBoundingClientRect();
      const style = getComputedStyle(field);
      const fg = luminance(style.color), bg = luminance(style.backgroundColor);
      const contrast = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
      return box.width > 0 && (box.left < 0 || box.right > innerWidth + 1 || contrast < 4.5 || box.height < 40);
    }).map((field) => field.outerHTML);
  });
  expect(problems).toEqual([]);
  const logosOutsideTheirFrame = await page.getByAltText("HYROX").evaluateAll((logos) =>
    logos.filter((logo) => {
      const box = logo.getBoundingClientRect();
      const frame = logo.parentElement!.getBoundingClientRect();
      return box.left < frame.left - 1 || box.right > frame.right + 1;
    }).length,
  );
  expect(logosOutsideTheirFrame).toBe(0);
}

for (const width of [320, 1440]) for (const theme of ["light", "dark"]) {
  test(`HYROX : programme, catalogue et séance à ${width}px / ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: new Date("2028-03-25T11:00:00Z") });
    await write(page, "/preferences", { theme });
    await page.goto("/sport?tab=workouts&program=new");
    const name = `Prépa hYrOx ${width} ${theme}`;
    await page.getByLabel("Nom du programme").fill("Force du samedi");
    await expect(page.getByRole("region", { name: "Préparation HYROX" })).toHaveCount(0);
    await page.getByLabel("Nom du programme").fill(name);
    const brand = page.getByRole("region", { name: "Préparation HYROX" });
    await expect(brand.getByAltText("HYROX")).toBeVisible();
    await expect(brand.getByAltText("HYROX")).toHaveJSProperty("naturalWidth", 520);
    await expect(brand).toContainText("EN ROUTE");
    const date = page.getByLabel("Date de votre prochain HYROX");
    await date.fill("2028-03-28");
    await expect(brand).toContainText("J−3");
    // Native date inputs have several keyboard segments before the next control.
    const clearDate = page.getByRole("button", { name: "Effacer la date de compétition" });
    for (let step = 0; step < 5 && !(await clearDate.evaluate((el) => el === document.activeElement)); step++) {
      await page.keyboard.press("Tab");
    }
    await expect(clearDate).toBeFocused();
    await page.getByRole("button", { name: "Ajouter un exercice", exact: true }).click();
    const search = page.getByLabel("Rechercher un exercice");
    await expect(search).toBeFocused();
    await expect(page.locator("#program-picker").getByAltText("HYROX")).toBeVisible();
    await search.fill("Développé couché à la barre");
    const option = page.locator(".sport-picker-item").filter({ hasText: "Développé couché à la barre" }).first();
    await option.focus();
    await option.press("Enter");
    await expect(page.getByLabel("Nombre de séries")).toBeFocused();
    await page.getByLabel("Nombre de séries").fill("2");
    await page.getByLabel("Charge totale (kg)", { exact: true }).fill("40");
    await page.getByLabel("Répétitions (rép.)", { exact: true }).fill("10");
    await readable(page);
    await page.screenshot({ path: info.outputPath("editor.png"), fullPage: true });
    const created = page.waitForResponse((r) => r.url().endsWith("/sport/workouts") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Enregistrer le programme" }).click();
    let workout: Workout = await (await created).json();
    expect(workout.competition_date).toBe("2028-03-28");
    const card = page.locator(".sport-workout").filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(card).toContainText("J−3");
    await card.screenshot({ path: info.outputPath("card.png") });
    await card.getByRole("button", { name: `Modifier ${name}` }).click();
    await expect(date).toHaveValue("2028-03-28");
    await date.fill("2028-03-29");
    await page.route(`**/api/v1/sport/workouts/${workout.id}`, async (route) => {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Réessayez votre enregistrement." }) });
    }, { times: 1 });
    await page.getByRole("button", { name: "Enregistrer le programme" }).click();
    await expect(page.getByRole("alert")).toContainText("Réessayez");
    await expect(date).toHaveValue("2028-03-29");
    await expect(brand).toContainText("J−4");
    const saved = page.waitForResponse((r) => r.url().endsWith(`/sport/workouts/${workout.id}`) && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Enregistrer le programme" }).click();
    workout = await (await saved).json();
    await card.getByRole("button", { name: "Démarrer l’entraînement" }).click();
    await expect(page.locator(".sport-training").getByRole("region", { name: "Préparation HYROX" })).toContainText("J−4");
    await expect(page.locator(".sport-rest").getByAltText("HYROX")).toBeVisible();
    const series = page.getByRole("form", { name: "Développé couché à la barre, série 1", exact: true });
    await series.getByLabel("Charge totale (kg)", { exact: true }).fill("42");
    await series.getByLabel("Répétitions (rép.)", { exact: true }).press("Enter");
    await expect(series.getByRole("button", { name: "Corriger la série" })).toBeVisible();
    await readable(page);
    await page.screenshot({ path: info.outputPath("training.png"), fullPage: true });
    // The active snapshot remains independent from subsequent changes to the program.
    await write(page, `/sport/workouts/${workout.id}`, {
      name: "Force après course", competition_date: "2028-04-20", expected_version: workout.version,
      entries: workout.entries.map(({ exercise_id, sets, target }) => ({ exercise_id, sets, target })),
    });
    await page.reload();
    await expect(page.locator(".sport-training").getByRole("region", { name: "Préparation HYROX" })).toContainText("J−4");
    await expect(series.getByLabel("Charge totale (kg)", { exact: true })).toHaveValue("42");
    const active: Training = await (await page.request.get("/api/v1/sport/sessions/active")).json();
    expect(active.competition_date).toBe("2028-03-29");
    expect(active.sets[0].values.weight_kg).toBe(42);
    await page.goto(`/sport?tab=workouts&program=${workout.id}`);
    await expect(brand).toHaveCount(0);
    await page.getByLabel("Nom du programme").fill(name);
    await expect(date).toHaveValue("2028-04-20");
    await clearDate.focus();
    await clearDate.press("Enter");
    const cleared = page.waitForResponse((r) => r.url().endsWith(`/sport/workouts/${workout.id}`) && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Enregistrer le programme" }).click();
    expect((await (await cleared).json()).competition_date).toBeNull();
    await expect(card).toContainText("EN ROUTE");
    await readable(page);
  });
}

test("HYROX : jours civils, jour J, date passée, effacement et titre", async ({ page }) => {
  await page.clock.install({ time: new Date("2028-03-25T22:59:50Z") }); // 23:59 in Paris, before DST.
  await page.goto("/sport?tab=workouts&program=new");
  await page.getByLabel("Nom du programme").fill("hyrox");
  const brand = page.getByRole("region", { name: "Préparation HYROX" });
  const date = page.getByLabel("Date de votre prochain HYROX");
  await date.fill("2028-03-27");
  await expect(brand).toContainText("J−2");
  await page.clock.fastForward(31_000);
  await expect(brand).toContainText("J−1");
  await page.clock.setSystemTime(new Date("2028-03-26T22:00:00Z")); // Midnight after a 23-hour day.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(brand).toContainText("JOUR J");
  await date.fill("2028-03-26");
  await expect(brand).toContainText("APRÈS COURSE");
  await expect(brand).not.toContainText("J−-");
  await page.getByLabel("Nom du programme").fill("Force");
  await expect(brand).toHaveCount(0);
  await expect(date).toHaveCount(0);
  await page.getByLabel("Nom du programme").fill("HYROX / Force");
  await expect(date).toHaveValue("2028-03-26");
  await page.getByRole("button", { name: "Effacer la date de compétition" }).click();
  await expect(date).toHaveValue("");
  await expect(brand).toContainText("EN ROUTE");
  await expect(brand.locator("time")).toHaveCount(0);
  await date.fill("2028-02-29");
  await expect(brand).toContainText("29 février 2028");
});

test("HYROX : date conservée après archivage et réactivation", async ({ page }) => {
  const workout = await write<Workout>(page, "/sport/workouts", {
    name: "HYROX — cycle de vie", competition_date: "2028-02-29",
    entries: [{ exercise_id: "builtin-da98dd6929927833d279", sets: 1 }],
  }, "POST");
  await page.goto("/sport?tab=workouts");
  const card = page.locator(".sport-workout").filter({ has: page.getByRole("heading", { name: workout.name, exact: true }) });
  await card.getByRole("button", { name: "Archiver", exact: true }).click();
  await page.getByLabel("Programmes archivés").check();
  await expect(card.locator("time")).toHaveAttribute("datetime", "2028-02-29");
  await card.getByRole("button", { name: "Restaurer", exact: true }).click();
  await page.getByLabel("Programmes archivés").uncheck();
  await expect(card.locator("time")).toHaveAttribute("datetime", "2028-02-29");
  await write(page, "/applications/sport", { enabled: false });
  expect((await page.request.get(`/api/v1/sport/workouts/${workout.id}`)).status()).toBe(403);
  await write(page, "/applications/sport", { enabled: true });
  await page.reload();
  await expect(card.locator("time")).toHaveAttribute("datetime", "2028-02-29");
});
