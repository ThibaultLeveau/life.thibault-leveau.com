import { expect, test } from "@playwright/test";
import { fixture } from "./assistant-fixture";

for (const locale of ["fr", "en"] as const) {
  for (const theme of ["light", "dark", "system"] as const) {
    for (const width of [1440, 320]) {
      test(`Dashboard ${locale} ${theme} ${width}: une ligne, clavier et navigation commune`, async ({
        page,
      }, info) => {
        const data = await fixture(page);
        data.session.locale = locale;
        data.session.theme = theme;
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({
          colorScheme: "dark",
          reducedMotion: "reduce",
        });
        await page.goto("/");
        const carousel = page.locator(".application-carousel");
        await expect(carousel.locator(".application-card")).toHaveCount(6);
        const bounds = await carousel
          .locator(".application-card")
          .evaluateAll((nodes) =>
            nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
          );
        expect(new Set(bounds).size).toBe(1);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await carousel.focus();
        await page.keyboard.press("End");
        await expect(
          carousel.locator(".application-open").last(),
        ).toBeFocused();
        await expect(
          carousel.locator(".application-open").last(),
        ).toBeInViewport();
        await page.keyboard.press("Home");
        await expect(
          carousel.locator(".application-open").first(),
        ).toBeFocused();
        await expect(
          carousel.locator(".application-open").first(),
        ).toBeInViewport();
        if (width === 320) {
          const menu = page.locator("#dashboard-main-menu");
          await menu.click();
          await expect(page.locator("#dashboard-main")).toHaveAttribute(
            "inert",
            "",
          );
          await expect(
            page.locator('.application-sidebar a[href="/tasks"]'),
          ).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(menu).toBeFocused();
        }
        await page.screenshot({
          path: info.outputPath("dashboard.png"),
          fullPage: true,
        });
        expect(
          data.requests.some((r) => r.path.startsWith("/assistant/")),
        ).toBe(false);
        const navigation = page.locator(".application-sidebar-links");
        const paths = [
          "/tasks", "/sport", "/tracking", "/okr", "/recipes", "/ai",
        ];
        const names = locale === "fr"
          ? [
              "Tâches", "Sport", "Suivi", "Objectifs OKR",
              "Recettes & Liste de courses", "Life AI",
            ]
          : [
              "Tasks", "Sport", "Tracking", "OKR Goals",
              "Recipes & Shopping lists", "Life AI",
            ];
        for (const [index, path] of paths.entries()) {
          await expect(navigation.locator(`a[href="${path}"]`)).toHaveText(
            names[index],
          );
        }
        await page.goto("/ai");
        if (width === 320) await page.locator("#assistant-main-menu").click();
        for (const path of paths) {
          await expect(navigation.locator(`a[href="${path}"]`)).toHaveCount(0);
        }
        await expect(navigation.getByRole("button", {
          name: locale === "fr" ? "Nouvelle conversation" : "New conversation",
          exact: true,
        })).toBeVisible();
        await expect(navigation.getByRole("button", {
          name: locale === "fr" ? "Mémoire" : "Memory", exact: true,
        })).toBeVisible();
        await expect(
          navigation.locator('a[href="/settings?application=life_ai"]'),
        ).toBeVisible();
        await expect(
          page.locator('.application-sidebar-footer a[href="/applications"]'),
        ).toBeVisible();
        if (width === 320) {
          await page.keyboard.press("Escape");
          await expect(page.locator("#assistant-main-menu")).toBeFocused();
        }
      });
    }
  }
}

test("démarrage : message envoyé une fois, historique sans texte privé et ancien lien", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/");
  const text = "Prépare mon projet confidentiel 104.";
  await page.locator("#dashboard-message").fill(text);
  await page.locator("#dashboard-message").press("Enter");
  await expect(page).toHaveURL(/\/ai\?conversation=new-1$/);
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  const sends = () =>
    data.requests.filter(
      (r) => r.path.endsWith("/messages") && r.method === "POST",
    );
  expect(sends()).toHaveLength(1);
  expect(sends()[0].body.content).toBe(text);
  expect(sends()[0].body.request_id).toMatch(/^[\da-f-]{36}$/);
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        url: location.href,
        state: history.state,
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain(text);
  await page.goBack();
  await expect(page.locator("#dashboard-message")).toHaveValue("");
  await page.goForward();
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  expect(sends()).toHaveLength(1);
  await page.goto("/?conversation=new-1");
  await expect(page).toHaveURL(/\/ai\?conversation=new-1$/);
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  expect(sends()).toHaveLength(1);
});

test("configuration absente : brouillon conservé, retour protégé, aucun envoi automatique ultérieur", async ({
  page,
}) => {
  const data = await fixture(page);
  data.setConfigured(false);
  await page.goto("/");
  await page.locator("#dashboard-message").fill("Une idée à conserver.");
  await page.locator("#dashboard-message").press("Enter");
  await expect(page).toHaveURL(/\/ai$/);
  const draft = page.getByLabel("Votre message", { exact: true });
  await expect(draft).toHaveValue("Une idée à conserver.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(page).toHaveURL(/\/ai$/);
  await expect(draft).toHaveValue("Une idée à conserver.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await expect(page.locator("#dashboard-message")).toHaveValue("");
  data.setConfigured(true);
  await page.goForward();
  await expect(draft).toHaveValue("");
  expect(
    data.requests.filter((r) => r.path.endsWith("/messages")),
  ).toHaveLength(0);
});

test("réglages lents : une modification du brouillon annule l’envoi automatique", async ({
  page,
}) => {
  const data = await fixture(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/assistant/settings", async (route) => {
    await pending;
    await route.fallback();
  });
  await page.goto("/");
  await page.locator("#dashboard-message").fill("Texte initial");
  await page.locator("#dashboard-message").press("Enter");
  const draft = page.getByLabel("Votre message", { exact: true });
  await draft.fill("Texte corrigé");
  release();
  await expect(
    page.getByRole("button", { name: "Envoyer le message", exact: true }),
  ).toBeEnabled();
  await expect(draft).toHaveValue("Texte corrigé");
  expect(
    data.requests.filter((r) => r.path.endsWith("/messages")),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Envoyer le message", exact: true })
    .click();
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  const sends = data.requests.filter((r) => r.path.endsWith("/messages"));
  expect(sends).toHaveLength(1);
  expect(sends[0].body.content).toBe("Texte corrigé");
});

test("désactivation et expiration démontent Life AI et ses données privées", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", []);
  data.disabled.add("life_ai");
  await page.goto("/");
  await expect(page.locator("#dashboard-message")).toHaveCount(0);
  await expect(
    page.locator(".application-carousel .application-card"),
  ).toHaveCount(5);
  await page.goto("/ai?conversation=conversation-1");
  await expect(
    page.getByRole("heading", { name: "Life AI est désactivée" }),
  ).toBeVisible();
  expect(
    data.requests.filter((r) => r.path.startsWith("/assistant/")),
  ).toHaveLength(0);
  data.disabled.delete("life_ai");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  data.disabled.add("life_ai");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".assistant-message")).toHaveCount(0);
  data.disabled.delete("life_ai");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".assistant-message")).toHaveCount(2);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("life-session-expired")),
  );
  await expect(page.getByLabel("Mot de passe")).toBeVisible();
  await expect(page.locator(".assistant-message")).toHaveCount(0);
});

for (const width of [1440, 320]) {
  test(`menu Dashboard ${width} : activation et protection du brouillon`, async ({
    page,
  }) => {
    const data = await fixture(page);
    data.disabled.add("sport");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const navigation = page.locator(".application-sidebar-links");
    await expect(navigation.locator('a[href="/sport"]')).toHaveCount(0);
    await expect(
      page.locator('.application-carousel a[href="/sport"]'),
    ).toHaveCount(0);
    data.disabled.delete("sport");
    await page.reload();
    await expect(navigation.locator('a[href="/sport"]')).toHaveCount(1);
    await page.locator("#dashboard-message").fill("Brouillon à conserver");
    if (width === 320) await page.locator("#dashboard-main-menu").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await navigation.locator('a[href="/ai"]').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#dashboard-message")).toHaveValue(
      "Brouillon à conserver",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await navigation.locator('a[href="/ai"]').click();
    await expect(page).toHaveURL(/\/ai$/);
    await expect(page.locator(".assistant-composer textarea")).toHaveValue("");
  });
}
