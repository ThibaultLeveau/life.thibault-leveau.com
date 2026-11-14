import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import type {
  Section,
  Status,
  Task,
  Workspace,
} from "../src/features/tasks/types";

const credentials = {
  username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
  password: process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
};

async function session(request: APIRequestContext) {
  const response = await request.post("/api/v1/auth/session", {
    data: credentials,
  });
  expect(response.ok()).toBeTruthy();
  const { csrf_token } = await response.json();
  return async <T>(
    path: string,
    data: unknown,
    method = "POST",
  ): Promise<T> => {
    const response = await request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { "X-CSRF-Token": csrf_token },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.status() === 204 ? (undefined as T) : response.json();
  };
}
async function seed(page: Page) {
  const mutate = await session(page.request);
  const space = await mutate<Workspace>("/workspaces", {
    name: `Projet ${Date.now()}`,
    description: "Du premier pas au projet terminé.",
  });
  const sections: Section[] = [];
  for (const [i, name] of [
    "À la maison",
    "Projets",
    "Tableau seulement",
    "Liste seulement",
  ].entries()) {
    sections.push(
      await mutate<Section>(`/workspaces/${space.id}/sections`, {
        name,
        visibility: i === 2 ? "board" : i === 3 ? "list" : "both",
      }),
    );
  }
  const statuses: Status[] = await (
    await page.request.get(`/api/v1/workspaces/${space.id}/statuses`)
  ).json();
  const tasks: Task[] = [];
  for (const [title, section] of [
    ["Préparer le voyage", 0],
    ["Réserver les billets", 0],
    ["Une idée pour demain", 2],
  ] as const) {
    tasks.push(
      await mutate<Task>("/tasks", {
        workspace_id: space.id,
        section_id: sections[section].id,
        title,
        priority: 2,
      }),
    );
  }
  await page.goto(`/tasks?space=${space.id}`);
  await expect(
    page.getByRole("button", { name: tasks[0].title, exact: true }),
  ).toBeVisible();
  return { mutate, space, sections, statuses, tasks };
}
async function closeDialog(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
}
async function drag(page: Page, task: Task, target: { x: number; y: number }) {
  const handle = page.getByRole("button", {
    name: `Glisser la tâche ${task.title}`,
    exact: true,
  });
  await expect(handle).toBeEnabled();
  const source = (await handle.boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(source.x + 12, source.y + 12, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 15 });
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/tasks/${task.id}/move`) &&
      response.request().method() === "POST",
    { timeout: 10_000 },
  );
  await page.mouse.up();
  expect((await saved).ok()).toBeTruthy();
}

test("connexion et cycle complet depuis les formulaires", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tasks");
  await page.getByLabel("Identifiant").fill(credentials.username);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page
    .getByRole("button", { name: "Nouvel espace", exact: true })
    .click();
  await page.getByLabel("Nom de l’espace").fill(`Personnel ${Date.now()}`);
  await page.getByLabel("Description").fill("Le quotidien, un pas à la fois.");
  await page
    .getByRole("button", { name: "Créer l’espace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ajouter une section", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Nom de la section").fill("Maison");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(dialog.getByLabel("Nom Maison", { exact: true })).toBeVisible();
  await dialog.getByRole("tab", { name: "Étiquettes" }).click();
  await dialog.getByPlaceholder("Nom de l’étiquette").fill("important");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(
    dialog.getByLabel("Nom important", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("tab", { name: "Colonnes" }).click();
  await dialog
    .getByRole("textbox", { name: "Nom du nouvel élément", exact: true })
    .fill("À vérifier");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(
    dialog.getByLabel("Nom À vérifier", { exact: true }),
  ).toBeVisible();
  await closeDialog(page);
  await page
    .getByRole("button", { name: "Nouvelle tâche", exact: true })
    .click();
  await dialog
    .getByLabel("Titre", { exact: true })
    .fill("Organiser le week-end");
  await dialog
    .getByRole("combobox", { name: "Section", exact: true })
    .selectOption({ label: "Maison" });
  await dialog
    .getByRole("combobox", { name: "Statut", exact: true })
    .selectOption({ label: "À vérifier" });
  await dialog
    .getByRole("combobox", { name: "Priorité", exact: true })
    .selectOption("1");
  await dialog.getByLabel("Échéance", { exact: true }).fill("2026-12-20");
  await dialog.getByLabel("important", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Ajouter la tâche", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Terminer : Organiser le week-end",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Rouvrir : Organiser le week-end",
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", {
      name: "Rouvrir : Organiser le week-end",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Organiser le week-end", exact: true })
    .click();
  await dialog.getByLabel("Titre", { exact: true }).fill("Organiser le séjour");
  await dialog
    .getByRole("combobox", { name: "Statut", exact: true })
    .selectOption({ label: "Terminé" });
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Organiser le séjour", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Historique", exact: true }).click();
  await expect(dialog.getByText("Tâche terminée", { exact: true })).toHaveCount(
    2,
  );
  await expect(
    dialog.getByText("Tâche rouverte", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Archiver", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Organiser le séjour", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Configurer l’espace", exact: true })
    .click();
  await dialog.getByRole("tab", { name: "Archives", exact: true }).click();
  await dialog.getByRole("button", { name: "Restaurer", exact: true }).click();
  await closeDialog(page);
  await expect(
    page.getByRole("button", { name: "Organiser le séjour", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filtres", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Priorité", exact: true })
    .selectOption("4");
  await expect(
    page.getByText("Aucune tâche ne correspond à ces filtres."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Effacer les filtres" }).click();
  await expect(
    page.getByRole("button", { name: "Organiser le séjour", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Se connecter" }),
  ).toBeVisible();
  expect((await page.request.get("/api/v1/tasks")).status()).toBe(401);
  expect(errors).toEqual([]);
});

test("kanban par lignes, glisser-déposer, ordre et thèmes persistants", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const { space, sections, statuses, tasks } = await seed(page);
  await expect(
    page.getByRole("heading", { name: "Tableau seulement", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Liste seulement", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tableau", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Liste seulement", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Tableau seulement", exact: true }),
  ).toBeVisible();
  const cell = page.locator(
    `[data-drop-section="${sections[1].id}"][data-drop-status="${statuses[2].id}"]`,
  );
  await cell.scrollIntoViewIfNeeded();
  const box = (await cell.boundingBox())!;
  await drag(page, tasks[0], { x: box.x + 100, y: box.y + 55 });
  await expect(cell.getByRole("checkbox")).toBeChecked();
  await page.reload();
  await expect(
    cell.getByRole("button", { name: tasks[0].title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("light");
  await expect(page.locator(".tasks-shell")).toHaveCSS(
    "background-color",
    "rgb(255, 254, 251)",
  );
  await page.screenshot({
    path: testInfo.outputPath("tableau-clair.png"),
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".tasks-shell")).toHaveCSS(
    "background-color",
    "rgb(26, 32, 29)",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".tasks-shell")).toHaveCSS(
    "background-color",
    "rgb(26, 32, 29)",
  );
  await expect(
    cell.getByRole("button", { name: tasks[0].title, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tableau-sombre.png"),
    fullPage: true,
  });
  let releaseView!: () => void;
  const heldView = new Promise<void>((resolve) => {
    releaseView = resolve;
  });
  await page.route(`**/api/v1/workspaces/${space.id}/view`, async (route) => {
    if (route.request().method() === "GET") await heldView;
    await route.continue();
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: `# ${space.name}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Liste", exact: true }),
  ).toBeDisabled();
  releaseView();
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.locator(".task-lists")).toBeVisible();
  const firstRow = page.locator(`[data-task-id="${tasks[1].id}"]`);
  await firstRow.scrollIntoViewIfNeeded();
  const row = (await firstRow.boundingBox())!;
  await drag(page, tasks[0], { x: row.x + 100, y: row.y + 12 });
  await expect(
    page.locator(`[data-drop-section="${sections[0].id}"] article`).first(),
  ).toHaveAttribute("data-task-id", tasks[0].id);
  const response = await page.request.get(`/api/v1/tasks/${tasks[0].id}`);
  expect((await response.json()).completed_at).toBeTruthy();
  const view = await (
    await page.request.get(`/api/v1/workspaces/${space.id}/view`)
  ).json();
  expect(view.layout).toBe("list");
  await page
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light dark");
});

test("mobile, clavier, déplacement entre espaces et gestion des erreurs", async ({
  page,
}, testInfo) => {
  const { mutate, tasks } = await seed(page);
  const other = await mutate<Workspace>("/workspaces", {
    name: `Travail ${Date.now()}`,
  });
  await page.reload();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: tasks[0].title, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Déplacer et réordonner", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Espace", exact: true })
    .selectOption(other.id);
  await expect(
    dialog.getByRole("button", { name: "Déplacer", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Déplacer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: tasks[0].title, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ouvrir la navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: `# ${other.name}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: tasks[0].title, exact: true }),
  ).toBeVisible();
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page
      .getByRole("button", { name: "Nouvelle tâche", exact: true })
      .click();
    await expect(dialog.getByLabel("Titre", { exact: true })).toBeFocused();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Nouvelle tâche", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`mobile-${width}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Configurer l’espace", exact: true })
    .click();
  await dialog.getByRole("tab", { name: "Espace", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    dialog.getByRole("tab", { name: "Sections", exact: true }),
  ).toBeFocused();
  await expect(
    dialog.getByRole("tab", { name: "Sections", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await closeDialog(page);
  await page.route("**/api/v1/tasks/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 409,
          json: {
            detail: "Cette tâche a changé. Rechargez-la avant de réessayer.",
          },
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: tasks[0].title, exact: true }).click();
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Cette tâche a changé");
  await expect(
    dialog.getByRole("button", { name: "Recharger la tâche enregistrée" }),
  ).toBeVisible();
  await closeDialog(page);
  await page.unroute("**/api/v1/tasks/*");
  await page.route("**/api/v1/tasks/*", (route) =>
    route.request().method() === "PATCH"
      ? route.abort("failed")
      : route.continue(),
  );
  await page.getByRole("button", { name: tasks[0].title, exact: true }).click();
  await dialog
    .getByLabel("Titre", { exact: true })
    .fill("Saisie conservée hors réseau");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Connexion interrompue",
  );
  await expect(dialog.getByLabel("Titre", { exact: true })).toHaveValue(
    "Saisie conservée hors réseau",
  );
  expect(
    (await (await page.request.get(`/api/v1/tasks/${tasks[0].id}`)).json())
      .title,
  ).toBe(tasks[0].title);
  await closeDialog(page);
});

test("espaces parents : création, déplacement, ordre et archives persistantes", async ({
  page,
}, testInfo) => {
  const mutate = await session(page.request);
  const parent = await mutate<Workspace>("/workspaces", {
    name: `Parent ${Date.now()}`,
  });
  await page.goto(`/tasks?space=${parent.id}`);
  const dialog = page.getByRole("dialog");
  const nav = page.getByRole("navigation", { name: "Espaces", exact: true });
  async function createChild(name: string, parentId: string) {
    await page
      .getByRole("button", { name: "Nouvel espace", exact: true })
      .click();
    await dialog.getByLabel("Nom de l’espace").fill(name);
    await dialog
      .getByLabel("Espace parent", { exact: true })
      .selectOption(parentId);
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/workspaces") &&
        response.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Créer l’espace", exact: true })
      .click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const space: Workspace = await response.json();
    expect(space.parent_id).toBe(parentId);
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: `# ${name}`, exact: true }),
    ).toBeVisible();
    return space;
  }
  const child = await createChild("Voyages", parent.id);
  const leaf = await createChild("Japon", child.id);
  const sibling = await createChild("Maison", parent.id);
  await page.reload();
  await expect(
    nav.getByRole("button", {
      name: `# ${parent.name} / Voyages / Japon`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Gérer et réordonner les espaces" })
    .click();
  await dialog
    .getByRole("button", { name: "Monter Maison", exact: true })
    .click();
  await expect
    .poll(async () => {
      const spaces: Workspace[] = await (
        await page.request.get("/api/v1/workspaces")
      ).json();
      return spaces
        .filter((space) => space.parent_id === parent.id)
        .map((space) => space.id);
    })
    .toEqual([sibling.id, child.id]);
  await closeDialog(page);
  await page.reload();
  const childButtons = nav
    .getByRole("button")
    .filter({ hasText: /Voyages|Maison|Japon/ });
  await expect(childButtons).toHaveText(["#Maison", "#Voyages", "#Japon"]);
  await nav
    .getByRole("button", { name: `# ${parent.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Configurer l’espace", exact: true })
    .click();
  const parents = dialog.getByLabel("Espace parent", { exact: true });
  for (const id of [parent.id, child.id, leaf.id, sibling.id]) {
    await expect(parents.locator(`option[value="${id}"]`)).toHaveCount(0);
  }
  await dialog.getByRole("button", { name: "Archiver", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("sous-espaces actifs");
  await closeDialog(page);
  await nav
    .getByRole("button", { name: `# ${parent.name} / Voyages`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Configurer l’espace", exact: true })
    .click();
  await dialog.getByLabel("Espace parent", { exact: true }).selectOption("");
  await dialog
    .getByRole("button", { name: "Enregistrer", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("enregistrées");
  await closeDialog(page);
  await page.reload();
  await expect(
    nav.getByRole("button", { name: "# Voyages / Japon", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/v1/workspaces/${child.id}`)).json())
      .parent_id,
  ).toBeNull();
  // The whole subtree follows its moved parent, including on mobile.
  await page.setViewportSize({ width: 375, height: 812 });
  await page
    .getByRole("button", { name: "Ouvrir la navigation", exact: true })
    .click();
  await expect(
    nav.getByRole("button", { name: "# Voyages / Japon", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("espaces-parents-mobile.png"),
    fullPage: true,
  });
  await nav
    .getByRole("button", { name: "# Voyages / Japon", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Configurer l’espace", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Archiver", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await mutate(`/workspaces/${child.id}`, { archived: true }, "PATCH");
  await page.reload();
  await page
    .getByRole("button", { name: "Ouvrir la navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Archives des espaces", exact: true })
    .click();
  const leafRow = dialog
    .locator(".archive-row")
    .filter({ hasText: "Voyages / Japon" });
  await expect(
    leafRow.getByRole("button", { name: "Restaurer", exact: true }),
  ).toBeDisabled();
  await dialog
    .locator(".archive-row")
    .filter({ has: page.getByText("Voyages", { exact: true }) })
    .getByRole("button", { name: "Restaurer", exact: true })
    .click();
  await expect(
    leafRow.getByRole("button", { name: "Restaurer", exact: true }),
  ).toBeEnabled();
  await leafRow.getByRole("button", { name: "Restaurer", exact: true }).click();
  await expect(leafRow).toHaveCount(0);
  await closeDialog(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Ouvrir la navigation", exact: true })
    .click();
  await expect(
    nav.getByRole("button", { name: "# Voyages / Japon", exact: true }),
  ).toBeVisible();
});
