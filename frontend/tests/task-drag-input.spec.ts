import { test, expect, type Page, type Locator } from "@playwright/test";
import type { Task, Workspace, Section, Status } from "../src/apps/tasks/types";

const restorePreferences = new WeakMap<Page, () => Promise<unknown>>();
test.afterEach(async ({ page }) => {
  await restorePreferences.get(page)?.();
});

async function seed(page: Page, locale = "fr", layout = "list") {
  const login = await page.request.post("/api/v1/auth/session", { data: {
    username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
    password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
  } });
  expect(login.ok()).toBeTruthy();
  const { csrf_token } = await login.json();
  const mutate = async <T>(path: string, data: unknown, method = "POST"): Promise<T> => {
    const response = await page.request.fetch(`/api/v1${path}`, {
      method, data, headers: { "X-CSRF-Token": csrf_token },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const preferences = await (await page.request.get("/api/v1/preferences")).json();
  restorePreferences.set(page, () => mutate("/preferences", preferences, "PUT"));
  await mutate("/preferences", { locale, theme: locale === "fr" ? "light" : "dark" }, "PUT");
  const space = await mutate<Workspace>("/workspaces", { name: `Source ${Date.now()}` });
  const other = await mutate<Workspace>("/workspaces", { name: `Target ${Date.now()}`, parent_id: space.id });
  const sections: Section[] = [];
  for (const name of ["First", "Second"])
    sections.push(await mutate<Section>(`/workspaces/${space.id}/sections`, { name }));
  const statuses: Status[] = await (await page.request.get(`/api/v1/workspaces/${space.id}/statuses`)).json();
  const tasks: Task[] = [];
  for (const title of ["Alpha", "Beta"])
    tasks.push(await mutate<Task>("/tasks", {
      workspace_id: space.id, section_id: sections[0].id, title,
      description: "Task body", due_date: "2027-01-20",
    }));
  const view = await (await page.request.get(`/api/v1/workspaces/${space.id}/view`)).json();
  await mutate(`/workspaces/${space.id}/view`, { ...view, layout }, "PUT");
  await page.goto(`/tasks?space=${space.id}`);
  await expect(page.locator(`[data-task-id="${tasks[0].id}"]`)).toBeVisible();
  return { space, other, sections, statuses, tasks, mutate };
}
const card = (page: Page, task: Task) => page.locator(`[data-task-id="${task.id}"]`);
async function idle(page: Page) {
  await expect(page.locator(".task-sync-status")).toHaveAttribute("data-pending", "0");
}
async function saved(page: Page, task: Task): Promise<Task> {
  await idle(page);
  return (await page.request.get(`/api/v1/tasks/${task.id}`)).json();
}
async function startDrag(page: Page, source: Locator) {
  await source.scrollIntoViewIfNeeded();
  const bounds = (await source.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y + 2, { steps: 3 });
  await expect(page.locator(".drag-overlay")).toBeVisible();
  await expect(page.locator(".task-selection-box")).toHaveCount(0);
}
async function drop(page: Page, source: Locator, target: Locator, endpoint: string, status = 200) {
  await target.scrollIntoViewIfNeeded();
  await startDrag(page, source);
  let bounds = (await target.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 15 });
  // Edge scrolling can move the destination while the pointer travels to it.
  bounds = (await target.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 15, { steps: 3 });
  await expect(target).toHaveClass(/is-drop-target|drop-before/);
  const response = page.waitForResponse(r => r.url().endsWith(endpoint) && r.request().method() === "POST", { timeout: 10_000 });
  await page.mouse.up();
  expect((await response).status()).toBe(status);
  await idle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".task-selection-bar")).toHaveCount(0);
}

for (const locale of ["fr", "en"]) {
  for (const layout of ["list", "board"]) {
    test(`Enter keeps quick entry ready: ${locale}, ${layout}`, async ({ page }) => {
      const { space } = await seed(page, locale, layout);
      await page.locator(".quick-add").first().click();
      const input = page.locator('.quick-add-form input[name="title"]');
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/api/v1/tasks", async route => {
        if (route.request().method() === "POST") await held;
        await route.continue();
      });
      try {
        await input.fill("First quick task");
        await input.press("Enter");
        await expect(input).toHaveValue("");
        await expect(input).toBeFocused();
        await page.keyboard.type("Second quick task");
        release();
        await idle(page);
        await expect(input).toHaveValue("Second quick task");
        await expect(input).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(input).toHaveValue("");
        await expect(input).toBeFocused();
        await idle(page);
        const result = await (await page.request.get(`/api/v1/tasks?workspace_id=${space.id}`)).json();
        expect(result.items.filter((t: Task) => t.title.endsWith("quick task"))).toHaveLength(2);
        await page.keyboard.press("Escape");
        await expect(input).toHaveCount(0);
      } finally { release(); }
    });
  }
}

test("quick entry preserves a rejected date and focus", async ({ page }) => {
  await seed(page);
  await page.locator(".quick-add").first().click();
  const input = page.locator('.quick-add-form input[name="title"]');
  await input.fill("Courir tous les mercredis toutes les trois");
  await input.press("Enter");
  await expect(page.locator(".quick-add-form [role=alert]")).toBeVisible();
  await expect(input).toHaveValue("Courir tous les mercredis toutes les trois");
  await expect(input).toBeFocused();
  await expect(input).not.toHaveAttribute("readonly");
});

test("task title/body drag: list sections, reorder, board columns and workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const { other, sections, statuses, tasks } = await seed(page);
  const targetSection = page.locator(`[data-drop-section="${sections[1].id}"]`);
  await drop(page, card(page, tasks[0]).locator(".task-title"), targetSection, `/tasks/${tasks[0].id}/move`);
  expect((await saved(page, tasks[0])).section_id).toBe(sections[1].id);
  await drop(page, card(page, tasks[0]).locator(".task-description"), card(page, tasks[1]), `/tasks/${tasks[0].id}/move`);
  expect((await saved(page, tasks[0])).section_id).toBe(sections[0].id);
  await expect(page.locator(`[data-drop-section="${sections[0].id}"] article`).first()).toHaveAttribute("data-task-id", tasks[0].id);
  await page.getByRole("button", { name: "Afficher", exact: true }).click();
  await page.getByLabel("Afficher les tâches terminées", { exact: true }).check();
  await page.getByRole("button", { name: "Afficher", exact: true }).click();
  await page.getByRole("button", { name: "Tableau", exact: true }).click();
  const completed = statuses.find(s => s.is_completed)!;
  const cell = page.locator(`[data-drop-section="${sections[1].id}"][data-drop-status="${completed.id}"]`);
  await drop(page, card(page, tasks[0]).locator(".task-title"), cell, `/tasks/${tasks[0].id}/move`);
  const before = await saved(page, tasks[0]);
  expect(before.status_id).toBe(completed.id);
  expect(before.completed_at).toBeTruthy();
  const history = await (await page.request.get(`/api/v1/tasks/${tasks[0].id}/events`)).json();
  const link = page.locator(".workspace-nav button").filter({ hasText: other.name });
  await drop(page, card(page, tasks[0]).locator(".task-description"), link, "/tasks/bulk");
  const after = await saved(page, tasks[0]);
  expect(after).toMatchObject({ workspace_id: other.id, section_id: null, completed_at: before.completed_at, due_date: before.due_date, created_at: before.created_at });
  const targetStatuses: Status[] = await (await page.request.get(`/api/v1/workspaces/${other.id}/statuses`)).json();
  expect(targetStatuses.find(s => s.id === after.status_id)?.is_completed).toBe(true);
  const afterHistory = await (await page.request.get(`/api/v1/tasks/${tasks[0].id}/events`)).json();
  expect(afterHistory.items).toEqual(expect.arrayContaining(history.items));
  await link.click();
  await page.getByRole("button", { name: "Afficher", exact: true }).click();
  await page.getByLabel("Afficher les tâches terminées", { exact: true }).check();
  await expect(page.locator('[data-drop-section="none"] .task-title').filter({ hasText: tasks[0].title })).toBeVisible();
  await idle(page);
  await page.reload();
  await page.getByRole("button", { name: "Afficher", exact: true }).click();
  await page.getByLabel("Afficher les tâches terminées", { exact: true }).check();
  await expect(card(page, tasks[0])).toBeVisible();
});

test("outside drops and Escape cancel; server rejection restores the task", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const { tasks, sections } = await seed(page);
  let writes = 0;
  page.on("request", request => { if (request.method() === "POST" && /tasks\/(bulk|.*\/move)$/.test(request.url())) writes++; });
  await startDrag(page, card(page, tasks[0]).locator(".task-title"));
  await page.mouse.move(1400, 20, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".drag-overlay")).toHaveCount(0);
  await startDrag(page, card(page, tasks[0]).locator(".task-description"));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".drag-overlay")).toHaveCount(0);
  expect(writes).toBe(0);
  const handle = card(page, tasks[0]).locator(".drag-handle");
  await handle.focus();
  // The keyboard sensor installs its document listener on the next event-loop turn.
  await page.keyboard.press("Space", { delay: 100 });
  await expect(page.locator(".drag-overlay")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.locator(".drag-overlay")).toHaveCount(0);
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
  await expect(handle).toBeFocused();
  await page.route(`**/tasks/${tasks[0].id}/move`, route => route.fulfill({ status: 409, json: { detail: "Conflict test" } }));
  await drop(page, card(page, tasks[0]).locator(".task-title"),
    page.locator(`[data-drop-section="${sections[1].id}"]`), `/tasks/${tasks[0].id}/move`, 409);
  await expect(page.getByRole("alert")).toContainText("Conflict test");
  expect((await saved(page, tasks[0])).section_id).toBe(sections[0].id);
  await expect(page.locator(`[data-drop-section="${sections[0].id}"] [data-task-id="${tasks[0].id}"]`)).toBeVisible();
});


test("list drop to an unvisited workspace preserves an open task and its labels", async ({ page }) => {
  const { space, other, tasks, mutate } = await seed(page, "en");
  const label = await mutate<{ id: string }>(`/workspaces/${space.id}/labels`, { name: "Keep label", color: "#668877" });
  await mutate(`/tasks/${tasks[0].id}`, { expected_version: tasks[0].version, label_ids: [label.id] }, "PATCH");
  await page.reload();
  await expect(card(page, tasks[0])).toBeVisible();
  const link = page.locator(".workspace-nav button").filter({ hasText: other.name });
  await drop(page, card(page, tasks[0]).locator(".task-title"), link, "/tasks/bulk");
  const moved = await saved(page, tasks[0]);
  expect(moved).toMatchObject({ workspace_id: other.id, section_id: null, completed_at: null, due_date: tasks[0].due_date });
  const labels: { id: string; name: string }[] = await (await page.request.get(`/api/v1/workspaces/${other.id}/labels`)).json();
  expect(labels.filter(label => moved.label_ids.includes(label.id)).map(label => label.name)).toEqual(["Keep label"]);
  await link.click();
  await expect(page.locator('[data-drop-section="none"] .task-title').filter({ hasText: tasks[0].title })).toBeVisible();
});
