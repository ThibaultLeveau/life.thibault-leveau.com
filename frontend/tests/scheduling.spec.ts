import { expect, test, type Page } from "@playwright/test";
import type { Task, Workspace } from "../src/features/tasks/types";

test.use({ timezoneId: "Europe/Paris" });

async function setup(page: Page, theme = "light") {
  await page.clock.setFixedTime(new Date("2027-01-27T10:00:00+01:00"));
  const login = await page.request.post("/api/v1/auth/session", {
    data: {
      username: process.env.LIFE_E2E_USERNAME || "browser-test",
      password: process.env.LIFE_E2E_PASSWORD || "synthetic-browser-password",
    },
  });
  expect(login.ok()).toBeTruthy();
  const { csrf_token } = await login.json();
  const headers = { "X-CSRF-Token": csrf_token };
  await page.request.put("/api/v1/preferences", { headers, data: { theme } });
  const response = await page.request.post("/api/v1/workspaces", {
    headers,
    data: { name: `Récurrences ${Date.now()}` },
  });
  const space: Workspace = await response.json();
  await page.goto(`/tasks?space=${space.id}`);
  await expect(page.getByRole("heading", { name: space.name })).toBeVisible();
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  return space;
}

async function save(page: Page) {
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/tasks") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Ajouter la tâche", exact: true })
    .click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return (await response.json()) as Task;
}

test("date reconnue en direct, sauvegarde immédiate et texte littéral", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByLabel("Titre", { exact: true })
    .fill("Acheter du pain demain");
  await expect(page.locator(".schedule-detected")).toContainText("demain");
  await expect(page.locator(".schedule-trigger")).toContainText("Demain");
  const task = await save(page);
  expect(task.title).toBe("Acheter du pain");
  expect(task.due_date).toBe("2027-01-28");
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  await page.getByLabel("Titre", { exact: true }).fill("Dessiner après-demain");
  const immediate = await save(page);
  expect(immediate.title).toBe("Dessiner");
  expect(immediate.due_date).toBe("2027-01-29");
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  await page.getByLabel("Titre", { exact: true }).fill("Le monde de demain");
  await page
    .getByRole("button", { name: "Garder ces mots dans le titre" })
    .click();
  const literal = await save(page);
  expect(literal.title).toBe("Le monde de demain");
  expect(literal.due_date).toBeNull();
});

test("récurrence naturelle, résolution, annulation et persistance", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByLabel("Titre", { exact: true })
    .fill("Courir tous les lundis et jeudis pour 3 fois");
  await expect(page.locator(".schedule-detected")).toContainText(
    "lundi, jeudi",
  );
  const task = await save(page);
  expect(task.title).toBe("Courir");
  expect(task.recurrence?.max_occurrences).toBe(3);
  expect(task.due_date).toBe("2027-01-28");
  await page.reload();
  await expect(
    page.getByLabel("Récurrence : Chaque semaine · lundi, jeudi"),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Terminer : Courir", exact: true })
    .click();
  await expect(page.locator(".notice")).toContainText("Prochaine");
  let result = (await (
    await page.request.get(`/api/v1/tasks/${task.id}`)
  ).json()) as Task;
  expect(result.due_date).toBe("2027-02-01");
  expect(result.recurrence_completed).toBe(1);
  await page.getByRole("button", { name: "Annuler la résolution" }).click();
  await expect(page.locator(".notice")).toContainText("Résolution annulée");
  result = (await (
    await page.request.get(`/api/v1/tasks/${task.id}`)
  ).json()) as Task;
  expect(result.due_date).toBe(task.due_date);
  expect(result.recurrence_completed).toBe(0);
  await page.getByRole("button", { name: "Courir", exact: true }).click();
  await page.locator(".schedule-trigger").click();
  await page.getByRole("button", { name: "Appliquer la récurrence" }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await (await page.request.get(`/api/v1/tasks/${task.id}`)).json())
      .due_date,
  ).toBe(task.due_date);
});

test("configuration mensuelle, dernier jour ouvré, exclusion et aperçu", async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.getByLabel("Titre", { exact: true }).fill("Clôturer les comptes");
  await page.locator(".schedule-trigger").click();
  await page.getByRole("tab", { name: "Répéter", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Unité", exact: true })
    .selectOption("MONTHLY");
  await page
    .getByRole("combobox", { name: "Quel jour ?", exact: true })
    .selectOption("weekday");
  await page
    .getByRole("combobox", { name: "Position", exact: true })
    .selectOption("-1");
  await page
    .getByRole("combobox", { name: "Jour", exact: true })
    .selectOption("MO,TU,WE,TH,FR");
  await page
    .getByText("Exceptions et réglages avancés", { exact: true })
    .click();
  await page.getByLabel("Exclure une date", { exact: true }).fill("2027-01-29");
  await page.getByRole("button", { name: "Exclure", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Fin de la récurrence", exact: true })
    .selectOption("count");
  await page.getByRole("spinbutton", { name: /Nombre d’occurrences/ }).fill("");
  await expect(
    page.getByRole("spinbutton", { name: /Nombre d’occurrences/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Appliquer la récurrence" }),
  ).toBeDisabled();
  await page
    .getByRole("spinbutton", { name: /Nombre d’occurrences/ })
    .fill("4");
  await expect(page.locator(".schedule-preview time").first()).toHaveAttribute(
    "datetime",
    "2027-02-26",
  );
  await expect(page.locator(".schedule-preview time")).toHaveCount(4);
  await page.getByRole("dialog").evaluate((dialog) => dialog.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("recurrence-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Appliquer la récurrence" }).click();
  const task = await save(page);
  expect(task.recurrence?.rrule).toContain("BYSETPOS=-1");
  expect(task.recurrence?.excluded_dates).toEqual(["2027-01-29"]);
  expect(task.due_date).toBe("2027-02-26");
  await expect(
    page.getByLabel("Récurrence : Chaque mois · dernier jour ouvré"),
  ).toBeVisible();
});

test("ajout rapide avec récurrence et dernière saisie prioritaire", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.locator(".quick-add").first().click();
  await page.getByLabel("Nom de la tâche").fill("Arroser demain");
  await page
    .getByLabel("Nom de la tâche")
    .fill("Arroser tous les 3 jours après résolution");
  await expect(page.locator(".schedule-detected")).toContainText(
    "après résolution",
  );
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/tasks") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  const task = (await (await response).json()) as Task;
  expect(task.title).toBe("Arroser");
  expect(task.recurrence?.mode).toBe("completion");
  expect(task.recurrence?.rrule).toContain("INTERVAL=3");
});

test("une réponse tardive ne remplace pas une date choisie au calendrier", async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/scheduling/parse", async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  const requested = page.waitForRequest("**/api/v1/scheduling/parse");
  await page
    .getByLabel("Titre", { exact: true })
    .fill("Préparer le voyage demain");
  await requested;
  await page.locator(".schedule-trigger").click();
  await page
    .getByRole("button", { name: "vendredi 29 janvier 2027", exact: true })
    .click();
  release();
  await expect(page.locator(".schedule-trigger")).toContainText("Après-demain");
  await expect(page.locator(".schedule-recognition")).toContainText(
    "Ces mots resteront dans le titre",
  );
  const task = await save(page);
  expect(task.due_date).toBe("2027-01-29");
  expect(task.title).toBe("Préparer le voyage demain");
});

test("intervalle annuel après résolution et navigation entre mois inégaux", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("Titre", { exact: true }).fill("Réviser le vélo");
  await page.locator(".schedule-trigger").click();
  await page
    .getByRole("button", { name: "dimanche 31 janvier 2027", exact: true })
    .focus();
  await page.keyboard.press("PageDown");
  await expect(
    page.getByRole("button", { name: "dimanche 28 février 2027", exact: true }),
  ).toBeFocused();
  await page.getByRole("tab", { name: "Répéter", exact: true }).click();
  await page.getByRole("button", { name: /Après résolution Le délai/ }).click();
  await page
    .getByRole("combobox", { name: "Unité", exact: true })
    .selectOption("YEARLY");
  await page
    .getByRole("spinbutton", { name: "Répéter tous les", exact: true })
    .fill("2");
  await expect(page.locator(".schedule-preview time").nth(1)).toHaveAttribute(
    "datetime",
    "2029-01-27",
  );
  await page.getByRole("button", { name: "Appliquer la récurrence" }).click();
  const task = await save(page);
  expect(task.recurrence?.mode).toBe("completion");
  expect(task.recurrence?.rrule).toBe("FREQ=YEARLY;INTERVAL=2");
});

test("le choix manuel conserve le titre nettoyé sans nouvelle interprétation", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByLabel("Titre", { exact: true })
    .fill("Préparer demain pour lundi");
  await expect(page.locator(".schedule-detected")).toContainText("demain");
  await page.locator(".schedule-trigger").click();
  await page
    .getByRole("button", { name: "vendredi 29 janvier 2027", exact: true })
    .click();
  await expect(page.locator(".schedule-recognition")).toContainText(
    "Ces mots resteront dans le titre",
  );
  const task = await save(page);
  expect(task.title).toBe("Préparer pour lundi");
  expect(task.due_date).toBe("2027-01-29");
});

for (const theme of ["light", "dark"])
  test(`calendrier mobile, clavier et absence de débordement (${theme})`, async ({
    page,
  }, testInfo) => {
    const width = theme === "light" ? 320 : 375;
    await page.setViewportSize({ width, height: 812 });
    await setup(page, theme);
    await page.getByLabel("Titre", { exact: true }).fill("Préparer le voyage");
    await page.locator(".schedule-trigger").click();
    const today = page.getByRole("button", {
      name: "mercredi 27 janvier 2027",
      exact: true,
    });
    await today.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("button", { name: "jeudi 28 janvier 2027", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`calendar-${theme}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Enter");
    await expect(page.locator(".schedule-trigger")).toContainText("Demain");
    await page.locator(".schedule-trigger").click();
    await page.getByRole("tab", { name: "Répéter", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Unité", exact: true })
      .selectOption("YEARLY");
    await page.getByRole("textbox", { name: /^Jours du mois/ }).fill("15");
    await expect(
      page.locator(".schedule-preview time").first(),
    ).toHaveAttribute("datetime", "2028-01-15");
    await expect(page.locator(".schedule-preview time").first()).toBeVisible();
    const overflow = await page
      .getByRole("dialog")
      .evaluate((dialog) => dialog.scrollWidth > dialog.clientWidth);
    expect(overflow).toBe(false);
    const inputs = await page
      .locator('input[type="date"]')
      .evaluateAll((elements) =>
        elements.map((e) => e.getBoundingClientRect().right),
      );
    expect(inputs.every((right) => right <= width)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`recurrence-${theme}.png`),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".schedule-trigger")).toBeFocused();
  });
