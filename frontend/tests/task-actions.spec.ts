import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import type { Task, Workspace, Section } from "../src/features/tasks/types";
import { localDate } from "../src/features/tasks/types";

async function seed(page: Page, count = 3) {
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
  const space = await mutate<Workspace>("/workspaces", {
    name: `Sélection ${Date.now()}`,
  });
  const tasks: Task[] = [];
  for (let index = 0; index < count; index++)
    tasks.push(
      await mutate<Task>("/tasks", {
        workspace_id: space.id,
        title: `Action ${index + 1}`,
        description: index === 0 ? "Un détail pour le test du menu." : "",
        due_date: localDate(),
      }),
    );
  await page.goto(`/tasks?space=${space.id}`);
  await expect(
    page.getByRole("button", {
      name: `Actions : ${tasks[0].title}`,
      exact: true,
    }),
  ).toBeEnabled();
  return { tasks, space, mutate };
}
const row = (page: Page, task: Task) =>
  page.locator(`[data-task-id="${task.id}"]`);
async function taskFromAPI(
  request: APIRequestContext,
  task: Task,
): Promise<Task> {
  return (await request.get(`/api/v1/tasks/${task.id}`)).json();
}
async function rectangle(page: Page, first: Task, last: Task) {
  await expect(
    row(page, first).getByRole("button", {
      name: `Actions : ${first.title}`,
      exact: true,
    }),
  ).toBeEnabled();
  const a = (await row(page, first).boundingBox())!;
  const b = (await row(page, last).boundingBox())!;
  await page.mouse.move(a.x + 60, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 48, b.y + b.height - 4, {
    steps: 12,
  });
  await expect(page.locator(".task-selection-box")).toBeVisible();
  await page.mouse.up();
}
async function touch(
  context: BrowserContext,
  page: Page,
  x: number,
  y: number,
  hold = true,
) {
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  if (hold)
    await page.waitForTimeout(520); // The interaction itself requires an elapsed hold.
  else {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - 65 }],
    });
    await page.waitForTimeout(520);
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await client.detach();
}

test("menu trois points et clic droit : clavier, copie, suppression réversible", async ({
  page,
}) => {
  const { tasks, space } = await seed(page);
  const trigger = page.getByRole("button", {
    name: `Actions : ${tasks[0].title}`,
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "Modifier", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Dupliquer" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await row(page, tasks[0])
    .getByRole("button", { name: tasks[0].title, exact: true })
    .focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Modifier", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Dupliquer" }).click();
  await expect(
    page.getByText("Tâche dupliquée.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-task-id]")).toHaveCount(4);
  const all: { items: Task[] } = await (
    await page.request.get(`/api/v1/tasks?workspace_id=${space.id}`)
  ).json();
  const copy = all.items.find(
    (task) => !tasks.some((original) => original.id === task.id),
  )!;
  expect(copy.title).toBe(tasks[0].title);
  expect(copy.completed_at).toBeNull();
  await row(page, copy)
    .getByRole("button", { name: `Actions : ${copy.title}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Supprimer", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Annuler" })
    .click();
  expect((await taskFromAPI(page.request, copy)).archived_at).toBeNull();
  await row(page, copy).click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Supprimer", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Supprimer", exact: true })
    .click();
  await expect(row(page, copy)).toHaveCount(0);
  expect((await taskFromAPI(page.request, copy)).archived_at).not.toBeNull();
  expect((await taskFromAPI(page.request, tasks[0])).archived_at).toBeNull();
});

test("rectangle et actions groupées : dates, déplacement, suppression et désélection", async ({
  page,
}) => {
  const { tasks, space, mutate } = await seed(page);
  const section = await mutate<Section>(`/workspaces/${space.id}/sections`, {
    name: "Destination",
  });
  await rectangle(page, tasks[0], tasks[1]);
  await expect(
    page.getByText("2 sélectionnées", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: "test-results/selection-desktop.png" });
  await page
    .getByRole("button", { name: "Replanifier", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Demain", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Replanifier", exact: true })
    .click();
  await expect(
    page.getByText("2 tâches replanifiées.", { exact: true }),
  ).toBeVisible();
  const first = await taskFromAPI(page.request, tasks[0]);
  expect(first.due_date).not.toBe(tasks[0].due_date);
  expect((await taskFromAPI(page.request, tasks[1])).due_date).toBe(
    first.due_date,
  );
  expect((await taskFromAPI(page.request, tasks[2])).due_date).toBe(
    tasks[2].due_date,
  );
  await rectangle(page, tasks[0], tasks[1]);
  await page.getByRole("button", { name: "Déplacer", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Section", exact: true })
    .selectOption(section.id);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Déplacer", exact: true })
    .click();
  await expect(
    page.getByText("2 tâches déplacées.", { exact: true }),
  ).toBeVisible();
  expect((await taskFromAPI(page.request, tasks[0])).section_id).toBe(
    section.id,
  );
  // Reload also loads the section created externally before the move.
  await page.reload();
  await expect(row(page, tasks[0])).toBeVisible();
  await rectangle(page, tasks[0], tasks[1]);
  await page.getByRole("button", { name: "Tout désélectionner" }).click();
  await expect(
    page.getByRole("region", { name: "Actions de la sélection" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Sélectionner", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: `Sélectionner : ${tasks[0].title}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("checkbox", {
      name: `Sélectionner : ${tasks[1].title}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Supprimer", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Supprimer", exact: true })
    .click();
  await expect(row(page, tasks[0])).toHaveCount(0);
  expect(
    (await taskFromAPI(page.request, tasks[1])).archived_at,
  ).not.toBeNull();
  expect((await taskFromAPI(page.request, tasks[2])).archived_at).toBeNull();
});

test("un conflit de lot conserve la sélection et ne change aucune autre tâche", async ({
  page,
}) => {
  const { tasks, mutate } = await seed(page);
  await rectangle(page, tasks[0], tasks[1]);
  await page
    .getByRole("button", { name: "Replanifier", exact: true })
    .click();
  await mutate(
    `/tasks/${tasks[1].id}`,
    { expected_version: tasks[1].version, title: "Modifiée ailleurs" },
    "PATCH",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Demain", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Replanifier", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Cette tâche a changé");
  expect((await taskFromAPI(page.request, tasks[0])).version).toBe(
    tasks[0].version,
  );
  await expect(
    page.getByText("2 sélectionnées", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Recharger les tâches", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Modifiée ailleurs", exact: true }),
  ).toBeVisible();
});

test("tableau et agenda partagent menus et sélection entre espaces", async ({
  page,
}) => {
  const { tasks, space, mutate } = await seed(page);
  await page.getByRole("button", { name: "Tableau", exact: true }).click();
  await expect(page.locator(".task-card")).toHaveCount(3);
  await rectangle(page, tasks[0], tasks[1]);
  await expect(
    page.getByText("2 sélectionnées", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await row(page, tasks[0]).click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Dupliquer" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await mutate(
    "/agenda/view",
    {
      period: "today",
      custom_days: 14,
      include_overdue: false,
      show_completed: false,
    },
    "PUT",
  );
  const other = await mutate<Workspace>("/workspaces", {
    name: `Autre sélection ${Date.now()}`,
  });
  const otherTask = await mutate<Task>("/tasks", {
    workspace_id: other.id,
    title: "Autre espace à replanifier",
    due_date: localDate(),
  });
  await page.goto("/tasks?view=agenda");
  await expect(row(page, tasks[0])).toBeVisible();
  await row(page, tasks[0])
    .getByRole("button", { name: `Actions : ${tasks[0].title}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Sélectionner", exact: true })
    .click();
  await row(page, otherTask)
    .getByRole("button", { name: otherTask.title, exact: true })
    .click();
  await expect(
    page.getByText("2 sélectionnées", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Replanifier", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Demain", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Replanifier", exact: true })
    .click();
  await expect(row(page, tasks[0])).toHaveCount(0);
  await expect(row(page, otherTask)).toHaveCount(0);
  await expect(row(page, tasks[1])).toBeVisible();
  expect((await taskFromAPI(page.request, otherTask)).due_date).toBe(
    (await taskFromAPI(page.request, tasks[0])).due_date,
  );
  expect((await taskFromAPI(page.request, tasks[0])).workspace_id).toBe(
    space.id,
  );
});

test("mobile tactile : défilement, appui long, actions et navigation à 320/375 px", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    baseURL: test.info().project.use.baseURL,
  });
  const page = await context.newPage();
  const { tasks, mutate } = await seed(page, 10);
  const a = (await row(page, tasks[0]).boundingBox())!;
  await touch(context, page, a.x + 90, a.y + 25, false);
  await expect(
    page.getByRole("region", { name: "Actions de la sélection" }),
  ).toHaveCount(0);
  await row(page, tasks[0]).scrollIntoViewIfNeeded();
  const b = (await row(page, tasks[0]).boundingBox())!;
  await touch(context, page, b.x + 90, b.y + 25);
  await expect(
    page.getByText("1 sélectionnée", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row(page, tasks[1])
    .getByRole("button", { name: tasks[1].title, exact: true })
    .tap();
  await expect(
    page.getByText("2 sélectionnées", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/selection-mobile-light.png" });
  await page.getByRole("button", { name: "Replanifier", exact: true }).tap();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Demain", exact: true })
    .tap();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Replanifier", exact: true })
    .tap();
  await expect(
    page.getByText("2 tâches replanifiées.", { exact: true }),
  ).toBeVisible();
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Ouvrir la navigation" }).tap();
    await expect(
      page.getByRole("dialog", { name: "Navigation des tâches" }),
    ).toBeVisible();
    await expect(page.locator(".tasks-main")).toHaveAttribute("inert", "");
    await page
      .getByRole("dialog", { name: "Navigation des tâches" })
      .getByRole("button", { name: "Fermer la navigation" })
      .tap();
    await page
      .getByRole("button", {
        name: `Actions : ${tasks[0].title}`,
        exact: true,
      })
      .tap();
    const bounds = (await page.getByRole("menu").boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Ouvrir la navigation" }).tap();
  await page
    .getByRole("button", { name: "Nouvel espace", exact: true })
    .tap();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .tap();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !!document.activeElement?.closest(".tasks-main") &&
          getComputedStyle(document.activeElement).visibility === "visible",
      ),
    )
    .toBe(true);
  await mutate("/preferences", { theme: "dark" }, "PUT");
  await page.reload();
  await page
    .getByRole("button", { name: `Actions : ${tasks[0].title}`, exact: true })
    .tap();
  await page.screenshot({ path: "test-results/menu-mobile-dark.png" });
  await expect(page.getByRole("menu")).toHaveCSS(
    "background-color",
    "rgb(26, 32, 29)",
  );
  await context.close();
});

test("rectangle : défilement aux bords, annulation, Ctrl-clic et menu borné", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  const { tasks, space, mutate } = await seed(page, 16);
  const hidden = await mutate<Section>(`/workspaces/${space.id}/sections`, {
    name: "Seulement au tableau",
    visibility: "board",
  });
  const hiddenTask = await mutate<Task>("/tasks", {
    workspace_id: space.id,
    section_id: hidden.id,
    title: "Tâche masquée",
  });
  await page.reload();
  await expect(row(page, tasks[0])).toBeVisible();
  await expect(row(page, hiddenTask)).toHaveCount(0);
  const first = (await row(page, tasks[0]).boundingBox())!;
  await page.mouse.move(first.x + 70, first.y + 5);
  await page.mouse.down();
  await page.mouse.move(first.x + 250, 795, { steps: 12 });
  await expect
    .poll(() => page.locator(".tasks-main").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(180);
  await expect
    .poll(() => page.locator('.task-select[aria-checked="true"]').count())
    .toBeGreaterThan(6);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".task-selection-box")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Actions de la sélection" }),
  ).toHaveCount(0);
  await row(page, tasks[0]).scrollIntoViewIfNeeded();
  await row(page, tasks[0])
    .getByRole("button", { name: tasks[0].title, exact: true })
    .click({ modifiers: ["Control"] });
  await row(page, tasks[1])
    .getByRole("button", { name: tasks[1].title, exact: true })
    .click();
  await expect(
    page.getByText("2 sélectionnées", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Tout désélectionner" }).click();
  await row(page, tasks[15]).scrollIntoViewIfNeeded();
  const last = (await row(page, tasks[15]).boundingBox())!;
  await page.mouse.click(last.x + last.width - 4, last.y + last.height - 4, {
    button: "right",
  });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1200);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);
  await page.getByRole("heading", { name: `# ${space.name}` }).click();
  await expect(menu).toHaveCount(0);
  expect((await taskFromAPI(page.request, hiddenTask)).version).toBe(1);
});
