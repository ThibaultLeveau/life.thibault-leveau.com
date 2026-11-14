import { test, expect, type Page } from "@playwright/test";
import type { Section, Task, Workspace } from "../src/features/tasks/types";

// The local day must take precedence over the UTC day in API queries and labels.
test.use({ timezoneId: "America/Los_Angeles" });

async function setup(page: Page) {
  await page.clock.install({ time: new Date("2027-01-01T07:30:00Z") }); // Dec 31, 23:30 local
  const login = await page.request.post("/api/v1/auth/session", {
    data: {
      username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
      password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
    },
  });
  expect(login.ok()).toBeTruthy();
  const { csrf_token } = await login.json();
  const mutate = async <T>(
    path: string,
    data: unknown,
    method = "POST",
  ): Promise<T> => {
    const response = await page.request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { "X-CSRF-Token": csrf_token },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  await mutate("/agenda/view", {}, "PUT");
  const home = await mutate<Workspace>("/workspaces", {
    name: "Agenda maison",
  });
  const work = await mutate<Workspace>("/workspaces", {
    name: "Agenda travail",
    parent_id: home.id,
  });
  const section = await mutate<Section>(`/workspaces/${work.id}/sections`, {
    name: "À préparer",
    visibility: "board",
  });
  const tasks: Record<string, Task> = {};
  for (const [title, date] of [
    ["Retard agenda", "2026-12-30"],
    ["Jour agenda", "2026-12-31"],
    ["Demain agenda", "2027-01-01"],
    ["Après demain agenda", "2027-01-02"],
    ["Fin semaine agenda", "2027-01-06"],
    ["Hors semaine agenda", "2027-01-07"],
    ["Sans date agenda", null],
  ]) {
    tasks[title!] = await mutate<Task>("/tasks", {
      workspace_id: title === "Demain agenda" ? work.id : home.id,
      section_id: title === "Demain agenda" ? section.id : null,
      title,
      due_date: date,
    });
  }
  const cleanup = async () => {
    await mutate(`/workspaces/${work.id}`, { archived: true }, "PATCH");
    await mutate(`/workspaces/${home.id}`, { archived: true }, "PATCH");
  };
  await page.goto("/tasks");
  await expect(
    page.getByRole("heading", { name: "À venir", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(`[data-task-id="${tasks["Jour agenda"].id}"]`),
  ).toBeVisible();
  return { home, work, tasks, mutate, cleanup };
}
const card = (page: Page, task: Task) =>
  page.locator(`[data-task-id="${task.id}"]`);
async function period(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

test("agenda global : périodes, réglages persistants et cycle de tâche", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { tasks, cleanup } = await setup(page);
  try {
    await expect(card(page, tasks["Retard agenda"]).locator("time")).toHaveText(
      "Hier · En retard",
    );
    await expect(card(page, tasks["Jour agenda"]).locator("time")).toHaveClass(
      /is-today/,
    );
    await expect(card(page, tasks["Demain agenda"])).toHaveCount(0);
    await period(page, "Demain");
    await expect(card(page, tasks["Demain agenda"]).locator("time")).toHaveText(
      "Demain",
    );
    await expect(card(page, tasks["Demain agenda"])).toContainText(
      "Agenda maison / Agenda travail / À préparer",
    );
    await expect(card(page, tasks["Jour agenda"])).toHaveCount(0);
    await period(page, "Semaine");
    await expect(
      card(page, tasks["Après demain agenda"]).locator("time"),
    ).toHaveText("Après-demain");
    await expect(card(page, tasks["Fin semaine agenda"])).toBeVisible();
    await expect(card(page, tasks["Hors semaine agenda"])).toHaveCount(0);
    await expect(card(page, tasks["Sans date agenda"])).toHaveCount(0);
    await page.getByLabel("Apparence").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const colors = await Promise.all(
      [
        "Retard agenda",
        "Jour agenda",
        "Demain agenda",
        "Après demain agenda",
      ].map((title) =>
        card(page, tasks[title])
          .locator("time")
          .evaluate((node) => getComputedStyle(node).color),
      ),
    );
    expect(new Set(colors).size).toBe(4);
    await page.screenshot({
      path: "test-results/agenda-light.png",
      fullPage: true,
    });
    await period(page, "Personnalisé");
    await page.getByLabel("Nombre de jours").fill("8");
    await page.getByRole("button", { name: "Appliquer", exact: true }).click();
    await expect(card(page, tasks["Hors semaine agenda"])).toBeVisible();
    await expect(
      card(page, tasks["Hors semaine agenda"]).locator("time"),
    ).toHaveText("7 janv. 2027");
    await page.getByLabel("Inclure les retards").uncheck();
    await expect(card(page, tasks["Retard agenda"])).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("Nombre de jours")).toHaveValue("8");
    await expect(page.getByLabel("Inclure les retards")).not.toBeChecked();
    const settings = await (
      await page.request.get("/api/v1/agenda/view")
    ).json();
    expect(settings).toMatchObject({
      period: "custom",
      custom_days: 8,
      include_overdue: false,
    });
    const read = await page.request.get(
      "/api/v1/agenda/tasks?today=2026-12-31",
    );
    const ids = (await read.json()).items.map((item: Task) => item.id);
    await expect(page.locator(".agenda-task")).toHaveCount(ids.length);
    await page
      .getByRole("checkbox", { name: "Terminer : Jour agenda", exact: true })
      .click();
    await expect(card(page, tasks["Jour agenda"])).toHaveCount(0);
    await page.getByLabel("Afficher les tâches terminées").check();
    await expect(card(page, tasks["Jour agenda"]).locator("time")).toHaveClass(
      /is-completed/,
    );
    await page
      .getByRole("checkbox", { name: "Rouvrir : Jour agenda", exact: true })
      .click();
    await expect(card(page, tasks["Jour agenda"]).locator("time")).toHaveClass(
      /is-today/,
    );
    await page
      .getByRole("button", { name: "Jour agenda", exact: true })
      .click();
    await page.getByLabel("Échéance", { exact: true }).fill("2027-02-01");
    await page
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(card(page, tasks["Jour agenda"])).toHaveCount(0);
    const events = await (
      await page.request.get(`/api/v1/tasks/${tasks["Jour agenda"].id}/events`)
    ).json();
    expect(events.items.map((item: { kind: string }) => item.kind)).toEqual([
      "created",
      "completed",
      "reopened",
      "updated",
    ]);
    expect(errors).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("dates partagées liste/kanban, minuit local, mobile et erreurs", async ({
  page,
}) => {
  const { home, tasks, cleanup } = await setup(page);
  try {
    await page.goto(`/tasks?space=${home.id}`);
    await expect(
      card(page, tasks["Après demain agenda"]).locator("time"),
    ).toHaveText("Après-demain");
    await page.getByRole("button", { name: "Tableau", exact: true }).click();
    await expect(
      card(page, tasks["Après demain agenda"]).locator("time"),
    ).toHaveClass(/is-soon/);
    await expect(
      card(page, tasks["Hors semaine agenda"]).locator("time"),
    ).toHaveText("7 janv. 2027");
    await page.getByRole("button", { name: "À venir", exact: true }).click();
    await expect(card(page, tasks["Jour agenda"])).toBeVisible();
    await page.clock.runFor(31 * 60 * 1000);
    await expect(card(page, tasks["Demain agenda"]).locator("time")).toHaveText(
      "Aujourd’hui",
    );
    await expect(card(page, tasks["Jour agenda"]).locator("time")).toHaveText(
      "Hier · En retard",
    );
    await page.route("**/api/v1/agenda/view", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"detail":"Indisponible"}',
          })
        : route.continue(),
    );
    await page.getByRole("button", { name: "Semaine", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Réglages non enregistrés",
    );
    await expect(
      page.getByRole("button", { name: "Aujourd’hui", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.unroute("**/api/v1/agenda/view");
    await period(page, "Semaine");
    await page.getByLabel("Apparence").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const colors = await Promise.all(
      [
        "Jour agenda",
        "Demain agenda",
        "Après demain agenda",
        "Fin semaine agenda",
      ].map((title) =>
        card(page, tasks[title])
          .locator("time")
          .evaluate((node) => getComputedStyle(node).color),
      ),
    );
    expect(new Set(colors).size).toBe(4);
    await page.screenshot({
      path: "test-results/agenda-dark.png",
      fullPage: true,
    });
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 850 });
      await expect(
        page.getByRole("heading", { name: "À venir", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await period(page, "Personnalisé");
      await expect(page.getByLabel("Nombre de jours")).toBeVisible();
      await page.screenshot({
        path: `test-results/agenda-mobile-${width}.png`,
        fullPage: true,
      });
    }
  } finally {
    await cleanup();
  }
});

test("dates relatives autour du changement d’heure", async ({ page }) => {
  const { tasks, mutate, cleanup } = await setup(page);
  try {
    // Los Angeles jumps from 02:00 to 03:00 on March 14, 2027.
    await page.clock.setSystemTime(new Date("2027-03-13T20:00:00Z"));
    await mutate(
      `/tasks/${tasks["Jour agenda"].id}`,
      { expected_version: 1, due_date: "2027-03-14" },
      "PATCH",
    );
    await mutate(
      `/tasks/${tasks["Après demain agenda"].id}`,
      { expected_version: 1, due_date: "2027-03-15" },
      "PATCH",
    );
    await mutate(
      "/agenda/view",
      { period: "week", include_overdue: false },
      "PUT",
    );
    await page.reload();
    await expect(card(page, tasks["Jour agenda"]).locator("time")).toHaveText(
      "Demain",
    );
    await expect(
      card(page, tasks["Après demain agenda"]).locator("time"),
    ).toHaveText("Après-demain");
    await page.clock.setSystemTime(new Date("2027-03-14T19:00:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(card(page, tasks["Jour agenda"]).locator("time")).toHaveText(
      "Aujourd’hui",
    );
    await expect(
      card(page, tasks["Après demain agenda"]).locator("time"),
    ).toHaveText("Demain");
  } finally {
    await cleanup();
  }
});
