import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { Objective, Settings } from "../src/apps/okr/types";
let auth: BrowserContext,
  cookies: Awaited<ReturnType<BrowserContext["cookies"]>>,
  headers: Record<string, string>,
  settings: Settings;
let goal: Objective;
const stamp = Date.now();
const title = `Tester mon offre ${stamp}`;
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
  for (const id of ["okr", "tracking"])
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
  for (const o of await (
    await auth.request.get("/api/v1/okr/objectives")
  ).json())
    expect(
      (
        await auth.request.put(`/api/v1/okr/objectives/${o.id}/archive`, {
          headers,
          data: { expected_version: o.version, archived: true },
        })
      ).ok(),
    ).toBeTruthy();
  settings = await (await auth.request.get("/api/v1/okr/settings")).json();
});
test.beforeEach(async ({ page }) => {
  await page.context().addCookies(cookies);
});
test.afterAll(async () => {
  await auth?.request.put("/api/v1/preferences", {
    headers,
    data: { locale: "fr", theme: "light" },
  });
  await auth?.close();
});
async function tab(page: Page, name: string) {
  if (!(await page.locator(".application-sidebar").isVisible()))
    await page
      .getByRole("button", { name: "Ouvrir la navigation", exact: true })
      .click();
  await page
    .locator(".application-sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}
async function list(page: Page): Promise<Objective[]> {
  return (await page.request.get("/api/v1/okr/objectives")).json();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test("OKR : quatre horizons guidés, résultats clés et persistance API", async ({
  page,
}, info) => {
  await page.goto("/okr");
  await expect(
    page.getByRole("heading", { name: "Tout commence par une direction" }),
  ).toBeVisible();
  let parent = "";
  for (const [h, name] of [
    ["ten_year", `Une vie libre ${stamp}`],
    ["three_year", `Mon activité ${stamp}`],
    ["annual", `Une offre validée ${stamp}`],
    ["quarterly", title],
  ]) {
    await page
      .getByRole("button", { name: "Nouvel objectif", exact: true })
      .first()
      .click();
    const editor = page.locator(".okr-editor");
    await editor
      .getByRole("combobox", { name: "Horizon", exact: true })
      .selectOption(h);
    await editor
      .getByRole("combobox", { name: "Domaine", exact: true })
      .selectOption("professional");
    await editor.getByLabel(/Votre objectif/).fill(name);
    if (parent)
      await editor
        .getByRole("combobox", { name: /Au service de quel objectif/ })
        .selectOption(parent);
    if (h !== "ten_year")
      await editor
        .getByLabel(/Pourquoi est-ce important/)
        .fill("Construire une activité durable");
    if (h === "annual" || h === "quarterly")
      await editor
        .getByLabel(/À quoi ressemblera la réussite/)
        .fill("Cinq retours documentés");
    if (h === "quarterly") {
      await editor
        .getByLabel(/Quelle est votre toute première action/)
        .fill("Inviter le premier client");
      await editor.getByLabel(/Date de début/).fill(settings.today);
      await editor.getByLabel(/Date de fin/).fill(settings.today);
      await editor
        .getByRole("button", { name: "Ajouter un résultat clé" })
        .click();
      await editor.getByLabel(/Résultat clé 1/).fill("Entretiens clients");
      await editor.getByLabel("Cible", { exact: true }).fill("5");
      await editor.getByLabel("Unité", { exact: true }).fill("clients");
    }
    await editor
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    const o = (await list(page)).find((o) => o.title === name)!;
    expect(o).toBeTruthy();
    expect(o.parent_id).toBe(parent || null);
    parent = o.id;
    if (h === "quarterly") goal = o;
  }
  expect(goal.horizon).toBe("quarterly");
  expect(goal.key_results[0].target).toBe(5);
  await expect(
    page
      .getByRole("region", { name: "À préparer", exact: true })
      .getByRole("button", { name: `Ouvrir ${title}`, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Ouvrir ${title}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("okr-board-desktop.png"),
    fullPage: true,
  });
});

test("OKR : suivi, clôture, rétrospective et quêtes sans double gain", async ({
  page,
}) => {
  await page.goto("/okr?tab=quarter");
  await page
    .getByRole("combobox", { name: `Déplacer ${title}`, exact: true })
    .selectOption("in_progress");
  await expect(
    page
      .getByRole("region", { name: "En cours", exact: true })
      .getByRole("button", { name: `Ouvrir ${title}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Ouvrir ${title}`, exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(
    dialog.getByRole("button", { name: "Terminer l’objectif", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Mettre à jour", exact: true })
    .click();
  await dialog.getByLabel("Valeur actuelle", { exact: true }).fill("5");
  await dialog
    .getByLabel(/Ce que vous avez appris/)
    .fill("Les clients comprennent mon offre.");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Terminer l’objectif", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Terminer l’objectif", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Bravo" }),
  ).toBeVisible();
  const reward = await (
    await page.request.get("/api/v1/progression/okr")
  ).json();
  expect(reward.xp).toBeGreaterThanOrEqual(115);
  expect(reward.quests_total).toBe(60);
  await tab(page, "Réalisations");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".okr-achievement").filter({ hasText: title }),
  ).toContainText("5 / 5 clients");
  await tab(page, "Ce trimestre");
  await page
    .getByRole("button", { name: `Ouvrir ${title}`, exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: title, exact: true });
  await dialog.getByRole("button", { name: "Rouvrir", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: `Ouvrir ${title}`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Terminer l’objectif", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await (await page.request.get("/api/v1/progression/okr")).json()).xp,
  ).toBe(reward.xp);
  await tab(page, "Réalisations");
  await expect(page.getByText("Rouvert depuis", { exact: true })).toBeVisible();
  await tab(page, "Ce trimestre");
  await page
    .getByRole("link", { name: "Mes quêtes dans Suivi", exact: true })
    .click();
  await expect(page).toHaveURL(/application=okr/);
  await expect(
    page
      .locator(".progression-app-picker")
      .getByRole("button", { name: /Objectifs OKR/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".progression-quest-card").first()).toBeVisible();
  goal = (await list(page)).find((o) => o.id === goal.id)!;
});

test("OKR : kanban glissé, ordre clavier et mobile 320 px", async ({
  page,
}, info) => {
  const created: Objective[] = [];
  for (const suffix of ["A", "B"]) {
    const r = await page.request.post("/api/v1/okr/objectives", {
      headers,
      data: {
        title: `Prochain pas ${suffix} ${stamp}`,
        domain: "personal",
        horizon: "quarterly",
        why: "Un pas utile",
        outcome: "Une avancée concrète",
        first_action: "Commencer",
        start_date: settings.today,
        due_date: settings.today,
        key_results: [{ title: "Livrable", start: 0, target: 1, current: 0 }],
      },
    });
    expect(r.ok()).toBeTruthy();
    created.push(await r.json());
  }
  await page.goto("/okr?tab=quarter");
  const a = created[0],
    b = created[1];
  await page
    .getByRole("button", {
      name: `Glisser ${a.title}. Les commandes de déplacement sont aussi disponibles.`,
      exact: true,
    })
    .dragTo(
      page
        .getByRole("region", { name: "En cours", exact: true })
        .locator("header"),
    );
  await expect(
    page
      .getByRole("region", { name: "En cours", exact: true })
      .getByRole("button", { name: `Ouvrir ${a.title}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: `Déplacer ${b.title}`, exact: true })
    .selectOption("in_progress");
  const up = page.getByRole("button", {
    name: `Monter ${b.title}`,
    exact: true,
  });
  await expect(up).toBeEnabled();
  await up.focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("region", { name: "En cours", exact: true })
      .locator(".okr-card")
      .first(),
  ).toContainText(b.title);
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "En cours", exact: true })
      .locator(".okr-card")
      .first(),
  ).toContainText(b.title);
  await page.setViewportSize({ width: 320, height: 812 });
  await noOverflow(page);
  await page
    .getByRole("button", { name: `Ouvrir ${b.title}`, exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Fermer", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: `Ouvrir ${b.title}`, exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath("okr-board-mobile.png"),
    fullPage: true,
  });
});

test("OKR : source Suivi par interface, instantané conservé et 60 quêtes", async ({
  page,
}) => {
  await page.goto("/tracking?tab=trackers&edit=new");
  await page
    .getByLabel("Nom du suivi", { exact: true })
    .fill(`Mon cap OKR ${stamp}`);
  await page
    .getByRole("button", { name: "Depuis une application", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Relier une application",
    exact: true,
  });
  await picker.getByRole("button", { name: /^Objectifs OKR/ }).click();
  await picker.getByRole("button", { name: /^Objectifs accomplis/ }).click();
  await picker.getByRole("checkbox", { name: "Objectif", exact: true }).check();
  await picker
    .getByRole("searchbox", { name: "Rechercher Objectif", exact: true })
    .fill(title);
  await picker
    .getByRole("combobox", { name: "Objectif", exact: true })
    .selectOption(goal.id);
  await picker
    .getByRole("button", { name: "Calculer l’aperçu", exact: true })
    .click();
  await expect(picker.locator(".tracking-source-preview strong")).toHaveText(
    "1",
  );
  await picker
    .getByRole("button", { name: "Utiliser cette mesure", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enregistrer le suivi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mes suivis", exact: true }),
  ).toBeVisible();
  const tracker = (
    await (await page.request.get("/api/v1/tracking/trackers")).json()
  ).find((t: { name: string }) => t.name === `Mon cap OKR ${stamp}`);
  expect(tracker.fields[0].source.application_id).toBe("okr");
  const write = await page.request.put(
    `/api/v1/tracking/trackers/${tracker.id}/entries/${settings.today}`,
    { headers, data: { complete: true } },
  );
  expect(write.ok()).toBeTruthy();
  const before = await write.json();
  expect(before.values[tracker.fields[0].id]).toBe(1);
  await page.request.put("/api/v1/applications/okr", {
    headers,
    data: { enabled: false },
  });
  const after = await (
    await page.request.get(
      `/api/v1/tracking/trackers/${tracker.id}/entries/${settings.today}`,
    )
  ).json();
  expect(after.entry.values).toEqual(before.values);
  await page.goto("/okr");
  await expect(page.getByRole("heading", { name: /désactivée/ })).toBeVisible();
  await page.goto("/applications");
  await page
    .getByRole("switch", { name: "Activer Objectifs OKR", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Désactiver Objectifs OKR", exact: true }),
  ).toBeChecked();
  await page.goto("/okr?tab=quarter");
  await expect(
    page.getByRole("button", { name: `Ouvrir ${title}`, exact: true }),
  ).toBeVisible();
});

test("OKR : brouillons, erreurs réseau, archives et réglages persistants", async ({
  page,
}) => {
  await page.goto("/okr?tab=quarter");
  await page
    .getByRole("button", { name: "Nouvel objectif", exact: true })
    .first()
    .click();
  await page.getByLabel(/Votre objectif/).fill("Brouillon à protéger");
  page.once("dialog", (d) => d.dismiss());
  await tab(page, "Votre cap");
  await expect(page.getByLabel(/Votre objectif/)).toHaveValue(
    "Brouillon à protéger",
  );
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await expect(page.getByLabel(/Votre objectif/)).toHaveValue(
    "Brouillon à protéger",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.route("**/api/v1/okr/objectives?archived=false", (route) =>
    route.abort(),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/v1/okr/objectives?archived=false");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Ouvrir ${title}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Ouvrir ${title}`, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archiver", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await tab(page, "Archives");
  await page
    .getByRole("button", { name: `Ouvrir ${title}`, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restaurer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await tab(page, "Réglages");
  await page.getByLabel("Fuseau horaire", { exact: true }).fill("Europe/Paris");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Réglages enregistrés.");
  const saved = await (await page.request.get("/api/v1/okr/settings")).json();
  expect(saved.timezone).toBe("Europe/Paris");
  expect(saved.version).toBeGreaterThan(0);
});

test("OKR : contenu FR/EN, clair/sombre/système et 320 px", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  for (const locale of ["fr", "en"]) {
    for (const theme of ["light", "dark", "system"]) {
      await page.request.put("/api/v1/preferences", {
        headers,
        data: { locale, theme },
      });
      await page.setViewportSize({ width: 320, height: 812 });
      await page.goto("/okr?tab=quarter");
      await expect(
        page.getByRole("heading", {
          name: locale === "fr" ? "Ce trimestre" : "This quarter",
          exact: true,
        }),
      ).toBeVisible();
      await noOverflow(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(
        page.getByRole("button", {
          name: `${locale === "fr" ? "Ouvrir" : "Open"} ${title}`,
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`okr-${locale}-${theme}-320.png`),
        fullPage: true,
      });
    }
  }
});
