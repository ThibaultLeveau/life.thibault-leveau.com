import { test, expect, type Page, type Route } from "@playwright/test";
import type { Task, Workspace } from "../src/apps/tasks/types";
import { localDate } from "../src/apps/tasks/types";

async function seed(page: Page) {
  const login = await page.request.post("/api/v1/auth/session", {
    data: {
      username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
      password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
    },
  });
  expect(login.ok()).toBeTruthy();
  const { csrf_token } = await login.json();
  const write = async <T>(
    path: string,
    data: unknown,
    method = "POST",
  ): Promise<T> => {
    const result = await page.request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { "X-CSRF-Token": csrf_token },
    });
    expect(result.ok(), await result.text()).toBeTruthy();
    return result.json();
  };
  const space = await write<Workspace>("/workspaces", {
    name: `Fluidité ${Date.now()}`,
  });
  const tasks: Task[] = [];
  for (let index = 0; index < 3; index++)
    tasks.push(
      await write<Task>("/tasks", {
        workspace_id: space.id,
        title: `Action fluide ${index + 1}`,
        due_date: localDate(),
      }),
    );
  await page.goto(`/tasks?space=${space.id}`);
  await expect(row(page, tasks[0])).toBeVisible();
  return { space, tasks, write };
}
const row = (page: Page, task: Task) =>
  page.locator(`[data-task-id="${task.id}"]`);
const state = async (page: Page, task: Task): Promise<Task> =>
  (await page.request.get(`/api/v1/tasks/${task.id}`)).json();
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((done) => {
    release = done;
  });
  return { promise, release };
}
async function hold(
  page: Page,
  pattern: string,
  release: ReturnType<typeof gate>,
  finish?: (route: Route) => Promise<void>,
) {
  await page.route(pattern, async (route) => {
    await release.promise;
    if (finish) await finish(route);
    else await route.continue();
  });
}

test("plusieurs validations et réouverture immédiates avant la réponse réseau", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  const release = gate();
  await hold(page, "**/api/v1/tasks/*/complete", release);
  await page.evaluate(() => {
    document.addEventListener("animationstart", (event) => {
      if ((event as AnimationEvent).animationName === "task-validation")
        document.documentElement.dataset.validationAnimated = "true";
    });
  });
  try {
    await row(page, tasks[0]).getByRole("checkbox").click();
    await expect(row(page, tasks[0]).getByRole("checkbox")).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute(
      "data-validation-animated",
      "true",
    );
    await row(page, tasks[1]).getByRole("checkbox").click();
    await expect(row(page, tasks[1]).getByRole("checkbox")).toBeChecked();
    await row(page, tasks[0]).getByRole("checkbox").click();
    await expect(row(page, tasks[0]).getByRole("checkbox")).not.toBeChecked();
    expect((await state(page, tasks[0])).completed_at).toBeNull();
    expect((await state(page, tasks[1])).completed_at).toBeNull();
    await expect(row(page, tasks[2]).getByRole("checkbox")).toBeEnabled();
  } finally {
    release.release();
  }
  await expect.poll(async () => (await state(page, tasks[0])).version).toBe(3);
  await expect
    .poll(async () => (await state(page, tasks[1])).completed_at)
    .not.toBeNull();
  expect((await state(page, tasks[0])).completed_at).toBeNull();
  await expect(page.locator(".task-sync-error")).toHaveCount(0);
});

test("un échec restaure uniquement la tâche concernée et conserve la validation suivante", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  const release = gate();
  await hold(
    page,
    `**/api/v1/tasks/${tasks[0].id}/complete`,
    release,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Échec de test" }),
      }),
  );
  try {
    await row(page, tasks[0]).getByRole("checkbox").click();
    await row(page, tasks[1]).getByRole("checkbox").click();
    await expect(row(page, tasks[0]).getByRole("checkbox")).toBeChecked();
    await expect(row(page, tasks[1]).getByRole("checkbox")).toBeChecked();
  } finally {
    release.release();
  }
  await expect(row(page, tasks[0]).getByRole("checkbox")).not.toBeChecked();
  await expect
    .poll(async () => (await state(page, tasks[1])).completed_at)
    .not.toBeNull();
  await expect(page.locator(".task-sync-error")).toContainText(
    "momentanément indisponible",
  );
});

test("création puis validation et édition restent utilisables pendant l’enregistrement", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  const release = gate();
  await page.route("**/api/v1/tasks", async (route) => {
    if (route.request().method() === "POST") await release.promise;
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Nouvelle tâche", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Titre", { exact: true })
      .fill("Une création fluide");
    await page
      .getByRole("button", { name: "Ajouter la tâche", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const draft = page.locator("[data-task-id]").filter({
      has: page.getByRole("button", {
        name: "Une création fluide",
        exact: true,
      }),
    });
    await expect(draft).toBeVisible();
    await draft.getByRole("checkbox").click();
    await expect(draft.getByRole("checkbox")).toBeChecked();
    await row(page, tasks[0])
      .getByRole("button", { name: tasks[0].title, exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Titre", { exact: true })
      .fill("Un titre modifié");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row(page, tasks[0])).toContainText("Un titre modifié");
  } finally {
    release.release();
  }
  await expect
    .poll(async () => (await state(page, tasks[0])).title)
    .toBe("Un titre modifié");
  await expect(page.locator(".task-sync-status")).not.toContainText(
    "enregistrement",
  );
  await expect(page.locator(".task-sync-error")).toHaveCount(0);
});

test("conflit serveur visible, brouillon conservé et réponse tardive sans écraser une autre tâche", async ({
  page,
}) => {
  const { tasks, write } = await seed(page);
  await write(
    `/tasks/${tasks[0].id}`,
    {
      expected_version: tasks[0].version,
      title: "Titre depuis un autre onglet",
    },
    "PATCH",
  );
  await row(page, tasks[0])
    .getByRole("button", { name: tasks[0].title, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Titre", { exact: true })
    .fill("Mon brouillon conservé");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row(page, tasks[1]).getByRole("checkbox").click();
  await expect(page.locator(".task-sync-error")).toBeVisible();
  await expect(row(page, tasks[0])).toContainText(
    "Titre depuis un autre onglet",
  );
  await expect
    .poll(async () => (await state(page, tasks[1])).completed_at)
    .not.toBeNull();
  await page.getByRole("button", { name: "Reprendre la saisie" }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Titre", { exact: true }),
  ).toHaveValue("Mon brouillon conservé");
});

test("À venir et ses réglages répondent immédiatement, y compris au clavier sur mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { tasks, write } = await seed(page);
  await write(
    "/agenda/view",
    {
      period: "today",
      custom_days: 7,
      include_overdue: true,
      show_completed: true,
    },
    "PUT",
  );
  await page.goto("/tasks?view=agenda");
  await expect(row(page, tasks[0])).toBeVisible();
  const release = gate();
  await hold(page, "**/api/v1/tasks/*/complete", release);
  try {
    await row(page, tasks[0]).getByRole("checkbox").focus();
    await page.keyboard.press("Space");
    await expect(row(page, tasks[0]).getByRole("checkbox")).toBeChecked();
    await row(page, tasks[1]).getByRole("checkbox").click();
    await expect(row(page, tasks[1]).getByRole("checkbox")).toBeChecked();
    const animation = await row(page, tasks[1])
      .getByRole("checkbox")
      .evaluate((element) => getComputedStyle(element).animationName);
    expect(animation).toBe("none");
    await page.getByRole("button", { name: "Demain", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Demain", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(row(page, tasks[2])).toHaveCount(0);
    await page
      .getByRole("button", { name: "Aujourd’hui", exact: true })
      .click();
    await expect(row(page, tasks[2])).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  } finally {
    release.release();
  }
  await expect
    .poll(async () => (await state(page, tasks[1])).completed_at)
    .not.toBeNull();
});

test("déplacement en attente puis validation d’une tâche dont la version change avec l’ordre", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  const release = gate();
  await hold(page, `**/api/v1/tasks/${tasks[0].id}/move`, release);
  try {
    await row(page, tasks[0])
      .getByRole("button", { name: tasks[0].title, exact: true })
      .click();
    await page.getByRole("button", { name: "Déplacer et réordonner" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Déplacer", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-task-id]").last()).toHaveAttribute(
      "data-task-id",
      tasks[0].id,
    );
    await row(page, tasks[1]).getByRole("checkbox").click();
    await expect(row(page, tasks[1]).getByRole("checkbox")).toBeChecked();
  } finally {
    release.release();
  }
  await expect
    .poll(async () => (await state(page, tasks[1])).completed_at)
    .not.toBeNull();
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
  await expect(page.locator(".task-sync-error")).toHaveCount(0);
});

test("sections : deux créations puis un réordonnancement avant confirmation serveur", async ({
  page,
}) => {
  const { space } = await seed(page);
  const release = gate();
  await page.route(
    `**/api/v1/workspaces/${space.id}/sections`,
    async (route) => {
      if (route.request().method() === "POST") await release.promise;
      await route.continue();
    },
  );
  try {
    await page
      .getByRole("button", { name: "Ajouter une section", exact: true })
      .click();
    const form = page.locator(".entity-form").last();
    await form.getByPlaceholder("Nom de la section").fill("Première fluide");
    await form.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.locator('.entity-list input[name="name"]')).toHaveCount(
      1,
    );
    await page
      .locator(".entity-form")
      .last()
      .getByPlaceholder("Nom de la section")
      .fill("Deuxième fluide");
    await page
      .locator(".entity-form")
      .last()
      .getByRole("button", { name: "Ajouter", exact: true })
      .click();
    await expect(page.locator('.entity-list input[name="name"]')).toHaveCount(
      2,
    );
    await page
      .getByRole("button", { name: "Monter Deuxième fluide", exact: true })
      .click();
    await expect(
      page.locator('.entity-list input[name="name"]').first(),
    ).toHaveValue("Deuxième fluide");
  } finally {
    release.release();
  }
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
  const sections = await (
    await page.request.get(`/api/v1/workspaces/${space.id}/sections`)
  ).json();
  expect(sections.map((section: { name: string }) => section.name)).toEqual([
    "Deuxième fluide",
    "Première fluide",
  ]);
  await expect(page.locator(".task-sync-error")).toHaveCount(0);
});

test("récurrence calculée par le serveur, autre validation et annulation", async ({
  page,
}) => {
  const { tasks, write } = await seed(page);
  const recurring = await write<Task>(
    `/tasks/${tasks[0].id}`,
    {
      expected_version: tasks[0].version,
      recurrence: {
        rrule: "FREQ=DAILY",
        start_date: localDate(),
        timezone: "Europe/Paris",
        mode: "scheduled",
        excluded_dates: [],
        end_date: null,
        max_occurrences: 3,
      },
    },
    "PATCH",
  );
  await page.reload();
  const release = gate();
  await hold(page, `**/api/v1/tasks/${tasks[1].id}/complete`, release);
  await row(page, recurring).getByRole("checkbox").click();
  await expect(page.locator(".notice")).toContainText("Prochaine");
  try {
    await row(page, tasks[1]).getByRole("checkbox").click();
    await expect(row(page, tasks[1]).getByRole("checkbox")).toBeChecked();
    const saved = await state(page, recurring);
    expect(saved.recurrence_completed).toBe(1);
    expect(saved.completed_at).toBeNull();
    expect(saved.due_date).not.toBe(recurring.due_date);
    await expect(row(page, recurring).getByRole("checkbox")).not.toBeChecked();
  } finally {
    release.release();
  }
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
  await row(page, recurring).getByRole("checkbox").click();
  await expect(
    page.getByRole("button", { name: "Annuler la résolution" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annuler la résolution" }).click();
  await expect(page.locator(".task-sync-status")).toContainText(
    "Résolution annulée",
  );
  expect((await state(page, recurring)).recurrence_completed).toBe(1);
});

test("expiration de session : aucune intention restante n’est envoyée ni conservée", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  const release = gate();
  let secondSent = false;
  await page.route(`**/api/v1/tasks/${tasks[1].id}/complete`, async (route) => {
    secondSent = true;
    await route.continue();
  });
  await hold(
    page,
    `**/api/v1/tasks/${tasks[0].id}/complete`,
    release,
    (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Session expirée" }),
      }),
  );
  try {
    await row(page, tasks[0]).getByRole("checkbox").click();
    await row(page, tasks[1]).getByRole("checkbox").click();
    await expect(row(page, tasks[1]).getByRole("checkbox")).toBeChecked();
  } finally {
    release.release();
  }
  await expect(page.getByLabel("Identifiant")).toBeVisible();
  await expect(page.locator("[data-task-id]")).toHaveCount(0);
  expect(secondSent).toBe(false);
  expect((await state(page, tasks[1])).completed_at).toBeNull();
});

test("une réponse en arrière-plan laisse le menu voisin ouvert", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  const release = gate();
  await hold(page, `**/api/v1/tasks/${tasks[0].id}/complete`, release);
  await row(page, tasks[0]).getByRole("checkbox").click();
  await row(page, tasks[1])
    .getByRole("button", { name: `Actions : ${tasks[1].title}` })
    .click();
  await expect(page.getByRole("menu")).toBeVisible();
  release.release();
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Modifier", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Titre", { exact: true }),
  ).toHaveValue(tasks[1].title);
});

test("une lecture périmée ne remplace jamais une validation plus récente", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  await page.route(`**/api/v1/tasks/${tasks[0].id}/complete`, (route) =>
    route.fulfill({ status: 503, json: { detail: "Lecture à réessayer" } }),
  );
  await row(page, tasks[0]).getByRole("checkbox").click();
  await expect(page.locator(".task-sync-error")).toBeVisible();
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
  const release = gate();
  let captured = false;
  await page.route("**/api/v1/tasks?**", async (route) => {
    const response = await route.fetch();
    captured = true;
    await release.promise;
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Recharger les tâches", exact: true })
    .click();
  await expect.poll(() => captured).toBe(true);
  try {
    await row(page, tasks[1]).getByRole("checkbox").click();
    await expect
      .poll(async () => (await state(page, tasks[1])).completed_at)
      .not.toBeNull();
  } finally {
    release.release();
  }
  await expect(row(page, tasks[1]).getByRole("checkbox")).toBeChecked();
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
  await row(page, tasks[2]).getByRole("checkbox").click();
  await expect
    .poll(async () => (await state(page, tasks[2])).completed_at)
    .not.toBeNull();
  await expect(row(page, tasks[1]).getByRole("checkbox")).toBeChecked();
});

test("éditer le titre pendant une résolution récurrente préserve la prochaine occurrence", async ({
  page,
}) => {
  const { tasks, write } = await seed(page);
  const recurring = await write<Task>(
    `/tasks/${tasks[0].id}`,
    {
      expected_version: tasks[0].version,
      recurrence: {
        rrule: "FREQ=DAILY",
        start_date: localDate(),
        timezone: "Europe/Paris",
        mode: "scheduled",
        excluded_dates: [],
        end_date: null,
        max_occurrences: 3,
      },
    },
    "PATCH",
  );
  await page.reload();
  const release = gate();
  await hold(page, `**/api/v1/tasks/${recurring.id}/complete`, release);
  try {
    await row(page, recurring).getByRole("checkbox").click();
    await row(page, recurring)
      .getByRole("button", { name: recurring.title, exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Titre", { exact: true })
      .fill("Titre après résolution");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await expect(row(page, recurring)).toContainText("Titre après résolution");
  } finally {
    release.release();
  }
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
  const saved = await state(page, recurring);
  expect(saved.title).toBe("Titre après résolution");
  expect(saved.recurrence_completed).toBe(1);
  expect(saved.completed_at).toBeNull();
  expect(saved.due_date).not.toBe(recurring.due_date);
  await expect(page.locator(".task-sync-error")).toHaveCount(0);
});

test("une relecture échouée ne laisse pas un enregistrement fantôme", async ({
  page,
}) => {
  const { tasks } = await seed(page);
  const release = gate();
  await hold(
    page,
    `**/api/v1/tasks/${tasks[0].id}/complete`,
    release,
    (route) => route.fulfill({ status: 503, json: {} }),
  );
  await page.route("**/api/v1/tasks?**", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  try {
    await row(page, tasks[0]).getByRole("checkbox").click();
    await expect(row(page, tasks[0]).getByRole("checkbox")).toBeChecked();
    // A later animation render must not be necessary to clear the saving state.
    await expect(page.locator(".is-validating")).toHaveCount(0);
  } finally {
    release.release();
  }
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
  await expect(row(page, tasks[0]).getByRole("checkbox")).not.toBeChecked();
  await page.unroute("**/api/v1/tasks?**");
  await row(page, tasks[1]).getByRole("checkbox").click();
  await expect
    .poll(async () => (await state(page, tasks[1])).completed_at)
    .not.toBeNull();
  await expect(page.locator(".task-sync-status")).toHaveAttribute(
    "data-pending",
    "0",
  );
});
