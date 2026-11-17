import { test, expect, type Page } from "@playwright/test";
import type { Task, Workspace, Status, Label } from "../src/apps/tasks/types";

async function seed(page: Page, count = 4) {
  const login = await page.request.post("/api/v1/auth/session", {
    data: {
      username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
      password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
    },
  });
  expect(login.ok()).toBeTruthy();
  const { csrf_token } = await login.json();
  async function write<T>(
    path: string,
    data: unknown,
    method = "POST",
  ): Promise<T> {
    const response = await page.request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { "X-CSRF-Token": csrf_token },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  await write("/preferences", { locale: "fr", theme: "light" }, "PUT");
  const space = await write<Workspace>("/workspaces", {
    name: `UX ${Date.now()}`,
  });
  const other = await write<Workspace>("/workspaces", {
    name: `Autre ${Date.now()}`,
    parent_id: space.id,
  });
  const tasks: Task[] = [];
  for (let i = 0; i < count; i++)
    tasks.push(
      await write<Task>("/tasks", {
        workspace_id: space.id,
        title: `Parcours ${i + 1}`,
        description: i === 0 ? "Aiguille globale" : "",
      }),
    );
  const distant = await write<Task>("/tasks", {
    workspace_id: other.id,
    title: "Aiguille distante",
  });
  await page.goto(`/tasks?space=${space.id}`);
  await expect(row(page, tasks[0])).toBeVisible();
  return { space, other, tasks, distant, write };
}
const row = (page: Page, task: Task) =>
  page.locator(`[data-task-id="${task.id}"]`);
async function idle(page: Page) {
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
}
async function menu(page: Page, task: Task, action: string) {
  await row(page, task)
    .getByRole("button", { name: `Actions : ${task.title}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}
async function confirm(page: Page, action: string) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: action, exact: true })
    .click();
  await idle(page);
}
async function saved(page: Page, task: Task): Promise<Task> {
  return (await page.request.get(`/api/v1/tasks/${task.id}`)).json();
}

test("recherche tous espaces, archives, filtres et navigation précédent", async ({
  page,
}) => {
  const { space, tasks, distant, write } = await seed(page);
  await write(`/tasks/${distant.id}/complete`, {
    expected_version: distant.version,
  });
  await page.reload();
  await page.getByRole("button", { name: /Rechercher.*K/ }).click();
  await expect(page.locator("#global-task-search")).toBeFocused();
  await page.locator("#global-task-search").fill("Aiguille");
  await page.keyboard.press("Control+k");
  await expect(page.locator("#global-task-search")).toHaveValue("Aiguille");
  await expect(row(page, tasks[0])).toBeVisible();
  await expect(row(page, distant)).toBeVisible();
  await page
    .getByRole("combobox", { name: "État des tâches" })
    .selectOption("open");
  await expect(row(page, distant)).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "État des tâches" })
    .selectOption("completed");
  await expect(row(page, distant)).toBeVisible();
  await expect(row(page, tasks[0])).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`space=${space.id}`));
  await page.goForward();
  await expect(page.locator("#global-task-search")).toHaveValue("Aiguille");
  await expect(
    page.getByRole("combobox", { name: "État des tâches" }),
  ).toHaveValue("completed");
  await page
    .getByRole("combobox", { name: "État des tâches" })
    .selectOption("open");
  await menu(page, tasks[0], "Archiver");
  await confirm(page, "Archiver");
  await page.getByRole("button", { name: "Autres vues des tâches" }).click();
  await page
    .getByRole("button", { name: "Archives des tâches", exact: true })
    .click();
  await page.getByRole("button", { name: "Rechercher et filtrer" }).click();
  await page
    .getByRole("combobox", { name: "Espace", exact: true })
    .selectOption(space.id);
  await expect(row(page, tasks[0])).toBeVisible();
  await menu(page, tasks[0], "Restaurer");
  await confirm(page, "Restaurer");
  await expect(row(page, tasks[0])).toHaveCount(0);
  expect((await saved(page, tasks[0])).archived_at).toBeNull();
});

test("sélection par intervalle, contexte partagé et priorité/statut/étiquettes groupés", async ({
  page,
}) => {
  const { space, tasks, write } = await seed(page);
  const labels = await write<Label>(`/workspaces/${space.id}/labels`, {
    name: "Important",
  });
  const statuses: Status[] = await (
    await page.request.get(`/api/v1/workspaces/${space.id}/statuses`)
  ).json();
  await page.getByRole("button", { name: "Sélectionner", exact: true }).click();
  await row(page, tasks[0]).getByRole("checkbox").click();
  await row(page, tasks[2])
    .getByRole("checkbox")
    .click({ modifiers: ["Shift"] });
  await expect(page.locator(".selection-count")).toHaveText("3 sélectionnées");
  await row(page, tasks[1]).click({ button: "right" });
  await expect(page.locator(".task-menu-caption")).toHaveText(
    "3 sélectionnées",
  );
  await page.getByRole("menuitem", { name: "Priorité", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("1");
  await confirm(page, "Priorité");
  for (const task of tasks.slice(0, 3))
    expect((await saved(page, task)).priority).toBe(1);
  expect((await saved(page, tasks[3])).priority).toBe(4);
  await page.getByRole("button", { name: "Sélectionner", exact: true }).click();
  await row(page, tasks[0]).getByRole("checkbox").click();
  await page.keyboard.press("Control+a");
  await expect(page.locator(".selection-count")).toHaveText("4 sélectionnées");
  await page.getByRole("button", { name: "Autres actions" }).click();
  await page.getByRole("menuitem", { name: "Étiquettes", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: labels.name })
    .check();
  await confirm(page, "Étiquettes");
  for (const task of tasks)
    expect((await saved(page, task)).label_ids).toContain(labels.id);
  await menu(page, tasks[0], "Statut");
  await page
    .getByRole("dialog")
    .getByRole("combobox")
    .selectOption(statuses.find((s) => s.is_completed)!.id);
  await confirm(page, "Statut");
  await expect(row(page, tasks[0])).toHaveCount(0);
  expect((await saved(page, tasks[0])).completed_at).not.toBeNull();
});

test("brouillon conservé sur Échap, navigation, langue et raccourci dans le dialogue", async ({
  page,
}) => {
  const { space } = await seed(page);
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Titre", exact: true })
    .fill("Brouillon précieux");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`space=${space.id}`));
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Titre", exact: true }),
  ).toHaveValue("Brouillon précieux");
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await page.locator(".quick-add").first().click();
  await page
    .locator(".quick-add-form input[name=title]")
    .fill("Saisie rapide gardée");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "À venir", exact: true }).click();
  await expect(page.locator(".quick-add-form input[name=title]")).toHaveValue(
    "Saisie rapide gardée",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("combobox", { name: "Langue", exact: true })
    .selectOption("en");
  await expect(page.locator(".quick-add-form input[name=title]")).toHaveValue(
    "Saisie rapide gardée",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "À venir", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "À venir", exact: true }),
  ).toBeVisible();
});

test("chargement destination en erreur : réessayer débloque le déplacement", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  let broken = true;
  await page.route("**/api/v1/workspaces/*/sections", (route) =>
    broken
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Erreur de recette" }),
        })
      : route.continue(),
  );
  await menu(page, tasks[0], "Déplacer");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "momentanément indisponible",
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Déplacer", exact: true }),
  ).toBeDisabled();
  broken = false;
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Déplacer", exact: true }),
  ).toBeEnabled();
  await confirm(page, "Déplacer");
});

test("clôture clavier : focus suivant et géométrie stable, mouvement réduit", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const before = (await row(page, tasks[1]).boundingBox())!;
  await row(page, tasks[0]).getByRole("checkbox").focus();
  await page.keyboard.press("Space");
  await expect(row(page, tasks[0])).toHaveCount(0);
  await expect(row(page, tasks[1]).getByRole("checkbox")).toBeFocused();
  await expect(page.locator(".task-feedback-toast")).toBeVisible();
  const after = (await row(page, tasks[1]).boundingBox())!;
  expect(after.y).toBeLessThan(before.y);
  expect(
    await row(page, tasks[1]).evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Annuler la résolution", exact: true })
    .click();
  await expect(row(page, tasks[0])).toBeVisible();
});

test("mobile 320px : recherche focalisée, cibles de 44px, menu complet et création agenda", async ({
  page,
}) => {
  const { tasks, space, write } = await seed(page);
  const label = await write<Label>(`/workspaces/${space.id}/labels`, {
    name: "X",
  });
  await write(
    `/tasks/${tasks[0].id}`,
    {
      expected_version: tasks[0].version,
      priority: 1,
      label_ids: [label.id],
    },
    "PATCH",
  );
  await page.reload();
  await page.setViewportSize({ width: 320, height: 740 });
  for (const selector of [
    ".task-checkbox",
    ".task-more",
    ".drag-handle",
    ".task-priority",
    ".task-label",
  ]) {
    const bounds = (await row(page, tasks[0]).locator(selector).boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page
    .getByRole("button", { name: "Ouvrir la navigation", exact: true })
    .click();
  await page.getByRole("button", { name: /Rechercher.*K/ }).click();
  await expect(page.locator("#global-task-search")).toBeFocused();
  await page.locator("#global-task-search").fill(tasks[0].title);
  await menu(page, tasks[0], "Dupliquer");
  await idle(page);
  await page
    .getByRole("button", { name: "Ouvrir la navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "À venir", exact: true }).click();
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Dans quel espace créer la tâche ?" }),
  ).toBeVisible();
});

test("lot multi-espace : duplication, étiquettes locales, archivage et restauration", async ({
  page,
}) => {
  const { space, other, write } = await seed(page, 1);
  const tag = `Lot ${Date.now()}`;
  await write<Task>("/tasks", { workspace_id: space.id, title: tag });
  await write<Task>("/tasks", { workspace_id: other.id, title: tag });
  const a = await write<Label>(`/workspaces/${space.id}/labels`, {
    name: "Étiquette A",
  });
  const b = await write<Label>(`/workspaces/${other.id}/labels`, {
    name: "Étiquette B",
  });
  await page.goto("/tasks?view=search");
  await page.locator("#global-task-search").fill(tag);
  await expect(page.locator("[data-task-id]")).toHaveCount(2);
  const selectAll = async () => {
    await page
      .getByRole("button", { name: "Sélectionner", exact: true })
      .click();
    await page.getByRole("button", { name: /Tout sélectionner/ }).click();
  };
  const more = async (action: string) => {
    await page
      .getByRole("button", { name: "Autres actions", exact: true })
      .click();
    await page.getByRole("menuitem", { name: action, exact: true }).click();
  };
  await selectAll();
  await more("Dupliquer");
  await confirm(page, "Dupliquer");
  await expect(page.locator("[data-task-id]")).toHaveCount(4);
  await selectAll();
  await more("Étiquettes");
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: a.name })
    .check();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: b.name })
    .check();
  await confirm(page, "Étiquettes");
  const result = await (
    await page.request.get(`/api/v1/tasks?search=${encodeURIComponent(tag)}`)
  ).json();
  expect(result.total).toBe(4);
  for (const task of result.items)
    expect(task.label_ids).toEqual([
      task.workspace_id === space.id ? a.id : b.id,
    ]);
  await selectAll();
  await page.getByRole("button", { name: "Terminer", exact: true }).click();
  await confirm(page, "Terminer");
  for (const task of result.items)
    expect((await saved(page, task)).completed_at).not.toBeNull();
  await selectAll();
  await page.getByRole("button", { name: "Rouvrir", exact: true }).click();
  await confirm(page, "Rouvrir");
  await selectAll();
  await more("Archiver");
  await confirm(page, "Archiver");
  await expect(page.locator("[data-task-id]")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Annuler l’archivage", exact: true })
    .click();
  await idle(page);
  await expect(page.locator("[data-task-id]")).toHaveCount(4);
  await selectAll();
  await more("Archiver");
  await confirm(page, "Archiver");
  await page
    .getByRole("combobox", { name: "État des tâches" })
    .selectOption("archives");
  await expect(page.locator("[data-task-id]")).toHaveCount(4);
  await selectAll();
  await page.getByRole("button", { name: "Restaurer", exact: true }).click();
  await confirm(page, "Restaurer");
  await expect(page.locator("[data-task-id]")).toHaveCount(0);
});

test("agenda : filtres enregistrés et création dans le bon espace", async ({
  page,
}) => {
  const { space, tasks, write } = await seed(page, 2);
  const today = new Date().toLocaleDateString("en-CA");
  await write(
    `/tasks/${tasks[0].id}`,
    { expected_version: tasks[0].version, due_date: today, priority: 1 },
    "PATCH",
  );
  await write(
    "/agenda/view",
    { period: "today", include_overdue: false },
    "PUT",
  );
  await page.goto("/tasks?view=agenda");
  await page.getByRole("button", { name: "Rechercher et filtrer" }).click();
  await page
    .locator(".agenda-filters")
    .getByRole("combobox", { name: "Espace", exact: true })
    .selectOption(space.id);
  await page
    .locator(".agenda-filters")
    .getByRole("combobox", { name: "Priorité", exact: true })
    .selectOption("1");
  await page.locator(".agenda-filters input").fill(tasks[0].title);
  await idle(page);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/agenda/view")).json()).search,
    )
    .toBe(tasks[0].title);
  await page.reload();
  await expect(page.locator(".agenda-filters input")).toHaveValue(
    tasks[0].title,
  );
  await expect(row(page, tasks[0])).toBeVisible();
  await expect(row(page, tasks[1])).toHaveCount(0);
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: space.name, exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".dialog-context"),
  ).toContainText(space.name);
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Titre", exact: true })
    .fill("Créée depuis agenda");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ajouter la tâche", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await idle(page);
  const found = await (
    await page.request.get("/api/v1/tasks?search=Créée%20depuis%20agenda")
  ).json();
  expect(found.items.some((task: Task) => task.workspace_id === space.id)).toBe(
    true,
  );
});

test("duplication groupée en attente : modifier les copies avant leur réponse", async ({
  page,
}) => {
  const { tasks } = await seed(page, 2);
  await page.getByRole("button", { name: "Sélectionner", exact: true }).click();
  await page.getByRole("button", { name: /Tout sélectionner/ }).click();
  await page
    .getByRole("button", { name: "Autres actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Dupliquer", exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/tasks/bulk", async (route) => {
    if (route.request().postDataJSON()?.action === "duplicate") await held;
    await route.continue();
  });
  try {
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Dupliquer", exact: true })
      .click();
    await expect(page.locator("[data-task-id]")).toHaveCount(4);
    // A queued edit must follow the temporary copy when its real UUID arrives.
    const copy = page
      .locator(
        `[data-task-id]:not([data-task-id="${tasks[0].id}"]):not([data-task-id="${tasks[1].id}"])`,
      )
      .first();
    await copy.locator(".task-more").click();
    await page.getByRole("menuitem", { name: "Priorité", exact: true }).click();
    await page.getByRole("dialog").getByRole("combobox").selectOption("1");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Priorité", exact: true })
      .click();
    await expect(copy.locator(".task-priority")).toContainText("P1");
  } finally {
    release();
  }
  await idle(page);
  await expect(page.locator("[data-task-id]")).toHaveCount(4);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const result = await (
    await page.request.get(
      `/api/v1/tasks?workspace_id=${tasks[0].workspace_id}`,
    )
  ).json();
  expect(
    result.items.filter(
      (task: Task) =>
        !tasks.some((original) => original.id === task.id) &&
        task.priority === 1,
    ),
  ).toHaveLength(1);
  for (const original of tasks)
    expect((await saved(page, original)).priority).toBe(4);
});

test("création d’espace : erreur récupérable et contexte stable pendant la réponse", async ({
  page,
}) => {
  await seed(page, 1);
  await page.getByRole("button", { name: "À venir", exact: true }).click();
  await page
    .getByRole("button", { name: "Nouvel espace", exact: true })
    .click();
  const name = `Espace lent ${Date.now()}`;
  await page.getByLabel("Nom de l’espace", { exact: true }).fill(name);
  let broken = true;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/workspaces", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (broken)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Recette" }),
      });
    await held;
    await route.continue();
  });
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Créer l’espace", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.locator("form")).toHaveAttribute("aria-busy", "false");
  await expect(
    dialog.getByLabel("Nom de l’espace", { exact: true }),
  ).toHaveValue(name);
  broken = false;
  try {
    await dialog
      .getByRole("button", { name: "Créer l’espace", exact: true })
      .click();
    await expect(dialog.locator("form")).toHaveAttribute("aria-busy", "true");
    await expect(dialog.locator("form")).toHaveAttribute("inert", "");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
  } finally {
    release();
  }
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: `# ${name}`, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  await expect(dialog.getByLabel("Titre", { exact: true })).toBeVisible();
  await expect(dialog.locator(".dialog-context")).toContainText(name);
});

test("agenda épuré : lignes centrées, métadonnées proches et notification compacte", async ({
  page,
}) => {
  const { space, tasks, write } = await seed(page, 3);
  const today = new Date().toLocaleDateString("en-CA");
  await write(
    `/workspaces/${space.id}`,
    { name: "Professionnel / Pro LifeOS / Organisation quotidienne" },
    "PATCH",
  );
  for (let index = 0; index < tasks.length; index++) {
    await write(
      `/tasks/${tasks[index].id}`,
      {
        expected_version: tasks[index].version,
        due_date: today,
        description: "",
        recurrence:
          index === 0
            ? {
                rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU",
                start_date: today,
                timezone: "Europe/Paris",
                mode: "scheduled",
                end_date: null,
                max_occurrences: null,
                excluded_dates: [],
              }
            : null,
      },
      "PATCH",
    );
  }
  await write(
    "/agenda/view",
    {
      period: "today",
      workspace_id: space.id,
      search: "",
      priority: null,
      label_id: null,
      include_overdue: false,
      show_completed: false,
    },
    "PUT",
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/tasks?view=agenda");
  await expect(
    row(page, tasks[0]).locator(".agenda-context-path"),
  ).toContainText("Organisation quotidienne");
  await expect(page.locator(".agenda-filters input")).toBeHidden();
  const filter = page.getByRole("button", { name: /Rechercher et filtrer/ });
  await expect(filter).toHaveAttribute("aria-expanded", "false");
  const view = (await page.locator(".agenda-view").boundingBox())!;
  const content = (await page.locator(".task-page-content").boundingBox())!;
  expect(view.width).toBeLessThanOrEqual(960);
  expect(
    Math.abs(view.x + view.width / 2 - content.x - content.width / 2),
  ).toBeLessThan(2);
  const heights: number[] = [];
  for (const task of tasks) {
    const item = row(page, task);
    const bounds = (await item.boundingBox())!;
    const title = (await item.locator(".task-title").boundingBox())!;
    const meta = (await item.locator(".task-meta").boundingBox())!;
    heights.push(bounds.height);
    expect(Math.abs(title.x - meta.x)).toBeLessThan(2);
    expect(meta.y - title.y - title.height).toBeGreaterThanOrEqual(-1);
    expect(meta.y - title.y - title.height).toBeLessThan(8);
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
  await page.screenshot({ path: test.info().outputPath("agenda-desktop.png") });
  await filter.click();
  await expect(page.locator(".agenda-filters input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(filter).toBeFocused();
  await expect(page.locator(".agenda-filters input")).toBeHidden();
  for (const width of [1920, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await row(page, tasks[0]).getByRole("checkbox").click();
    const toast = page.locator(".task-feedback-toast");
    await expect(toast).toContainText("Occurrence terminée");
    await expect(page.locator(".task-sync-status")).toBeEmpty();
    const bounds = (await toast.boundingBox())!;
    expect(bounds.height).toBeLessThan(width === 320 ? 170 : 100);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    const close = (await toast
      .getByRole("button", { name: "Fermer le message" })
      .boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.y + close.height).toBeLessThanOrEqual(
      bounds.y + bounds.height,
    );
    await page.screenshot({
      path: test.info().outputPath(`notification-${width}.png`),
    });
    await toast.getByRole("button", { name: "Annuler la résolution" }).click();
    await expect(toast).toHaveCount(0);
    await idle(page);
    await expect(row(page, tasks[0])).toBeVisible();
  }
});

test("navigation allégée : trois destinations dans le menu, recherche locale repliée", async ({
  page,
}) => {
  const { space } = await seed(page);
  const field = page.locator("#task-search");
  await expect(field).toBeHidden();
  await page.getByRole("button", { name: "Filtrer cet espace" }).click();
  await expect(field).toBeFocused();
  await field.fill("Parcours");
  await page.keyboard.press("Escape");
  await expect(field).toBeHidden();
  await expect(
    page.getByRole("button", { name: /Filtrer cet espace/ }),
  ).toContainText("1");
  await idle(page);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 320)
      await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
    const more = page.getByRole("button", { name: "Autres vues des tâches" });
    await expect(more).toHaveText("");
    await expect(
      page.getByRole("button", { name: "Toutes les tâches", exact: true }),
    ).toBeHidden();
    await more.click();
    await expect(
      page.getByRole("button", { name: "Sans échéance", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    if (width === 320)
      await expect(page.locator(".application-sidebar")).toHaveClass(/is-open/);
    await more.click();
    await page
      .getByRole("button", { name: "Toutes les tâches", exact: true })
      .click();
    await expect(page).toHaveURL(/view=all/);
    await expect(page.locator("#global-task-search")).toBeHidden();
    await page.goto(`/tasks?space=${space.id}`);
  }
});
