import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  defaultView,
  type Task,
  type Workspace,
} from "../src/apps/tasks/types";

async function seed(page: Page, count = 30) {
  await page.clock.setFixedTime(new Date("2030-04-05T10:00:00Z"));
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
  await mutate("/preferences", { theme: "light" }, "PUT");
  const space = await mutate<Workspace>("/workspaces", {
    name: `Mobile ${Date.now()}`,
  });
  const tasks: Task[] = [];
  for (let index = 0; index < count; index++)
    tasks.push(
      await mutate<Task>("/tasks", {
        workspace_id: space.id,
        title: `Repère ${index + 1}`,
        due_date: "2030-04-05",
      }),
    );
  const open = async (agenda = false) => {
    await page.goto(agenda ? "/tasks?view=agenda" : `/tasks?space=${space.id}`);
    await expect(row(page, tasks[0]).getByRole("checkbox")).toBeEnabled();
  };
  const cleanup = () =>
    mutate(`/workspaces/${space.id}`, { archived: true }, "PATCH");
  return { space, tasks, mutate, open, cleanup };
}

const row = (page: Page, task: Task) =>
  page.locator(`[data-task-id="${task.id}"]`);
const scrollTop = (page: Page) =>
  page.locator(".tasks-main").evaluate((node) => node.scrollTop);
async function center(target: Locator) {
  await target.evaluate((node) =>
    node.scrollIntoView({ block: "center", inline: "center" }),
  );
}
async function mobileFields(page: Page) {
  const small = await page
    .locator(
      'input:not([type="checkbox"]):not([type="color"]), select, textarea',
    )
    .evaluateAll((fields) =>
      fields
        .filter(
          (field) =>
            field.getClientRects().length &&
            getComputedStyle(field).visibility !== "hidden",
        )
        .filter((field) => parseFloat(getComputedStyle(field).fontSize) < 16)
        .map((field) => field.outerHTML),
    );
  expect(small).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute(
    "content",
    /user-scalable\s*=\s*(no|0)|maximum-scale/,
  );
}

async function mockViewport(page: Page) {
  // Desktop automation has no OS keyboard. Shrink only the visual viewport,
  // leaving innerHeight unchanged as on iOS/Android with resize-visual.
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), {
      height: 812,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    window.addEventListener("test-viewport", (event) => {
      const { scroll, ...values } = (event as CustomEvent).detail;
      Object.assign(viewport, values);
      viewport.dispatchEvent(new Event(scroll ? "scroll" : "resize"));
    });
  });
  return (height: number, offsetTop = 0, scroll = false, scale = 1) =>
    page.evaluate(
      (detail) =>
        window.dispatchEvent(new CustomEvent("test-viewport", { detail })),
      { height, offsetTop, scroll, scale },
    );
}

test.describe("confort tactile", () => {
  test.use({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });

  test("agenda : continuité pendant actualisation, erreur, disparition et récurrence", async ({
    page,
  }) => {
    const data = await seed(page);
    try {
      await data.mutate(
        "/agenda/view",
        { period: "today", include_overdue: false, show_completed: true },
        "PUT",
      );
      await data.open(true);
      const target = row(page, data.tasks[19]);
      await center(target);
      const before = await scrollTop(page);
      const retained = await target.elementHandle();
      let pending = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/api/v1/agenda/tasks?**", async (route) => {
        pending = true;
        await gate;
        await route.continue();
      });
      await target.getByRole("checkbox").click();
      await expect.poll(() => pending).toBeTruthy();
      try {
        expect(
          await retained!.evaluate((node) => node.isConnected),
        ).toBeTruthy();
        expect(await scrollTop(page)).toBeGreaterThan(before - 120);
        await expect(target.getByRole("checkbox")).toBeDisabled();
      } finally {
        release();
      }
      await expect(target.getByRole("checkbox")).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(target.getByRole("checkbox")).toBeEnabled();
      expect(await scrollTop(page)).toBeGreaterThan(before - 120);
      await page.unroute("**/api/v1/agenda/tasks?**");
      // A failed refresh leaves the last confirmed rows visible and offers retry.
      await page.route("**/api/v1/agenda/tasks?**", (route) =>
        route.fulfill({ status: 503, json: {} }),
      );
      await target.getByRole("checkbox").click();
      await expect(page.getByRole("alert")).toContainText("indisponible");
      expect(await retained!.evaluate((node) => node.isConnected)).toBeTruthy();
      expect(await scrollTop(page)).toBeGreaterThan(before - 120);
      await page.unroute("**/api/v1/agenda/tasks?**");
      await page
        .getByRole("button", { name: "Réessayer", exact: true })
        .click();
      await expect(target.getByRole("checkbox")).toHaveAttribute(
        "aria-checked",
        "false",
      );
      // A completed row may leave the filter; its neighbors must remain nearby.
      await data.mutate(
        "/agenda/view",
        { period: "today", include_overdue: false, show_completed: false },
        "PUT",
      );
      await data.open(true);
      await center(target);
      const neighbor = row(page, data.tasks[20]);
      const y = (await neighbor.boundingBox())!.y;
      await target.getByRole("checkbox").click();
      await expect(target).toHaveCount(0);
      expect(Math.abs((await neighbor.boundingBox())!.y - y)).toBeLessThan(150);
      const recurring = await data.mutate<Task>(
        `/tasks/${data.tasks[20].id}`,
        {
          expected_version: data.tasks[20].version,
          recurrence: {
            rrule: "FREQ=DAILY",
            start_date: "2030-04-05",
            mode: "scheduled",
            timezone: "Europe/Paris",
          },
        },
        "PATCH",
      );
      await data.open(true);
      await center(neighbor);
      const recurringBefore = await scrollTop(page);
      await neighbor.getByRole("checkbox").click();
      await expect(neighbor).toHaveCount(0);
      expect(await scrollTop(page)).toBeGreaterThan(recurringBefore - 150);
      const saved = await (
        await page.request.get(`/api/v1/tasks/${recurring.id}`)
      ).json();
      expect(saved.due_date).toBe("2030-04-06");
      expect(saved.completed_at).toBeNull();
    } finally {
      await data.cleanup();
    }
  });

  test("champs à 320/375 px, thèmes, réglages et cadrage", async ({
    page,
  }, testInfo) => {
    await page.goto("/tasks");
    await expect(page.getByLabel("Identifiant")).toBeVisible();
    await mobileFields(page);
    const data = await seed(page, 1);
    try {
      for (const [width, theme] of [
        [320, "light"],
        [375, "dark"],
      ] as const) {
        await page.setViewportSize({ width, height: 812 });
        await data.mutate("/preferences", { theme }, "PUT");
        await data.open();
        await page
          .getByRole("button", { name: "Filtres", exact: true })
          .click();
        await mobileFields(page);
        await page
          .getByRole("button", { name: "Nouvelle tâche", exact: true })
          .click();
        await mobileFields(page);
        await page
          .getByLabel("Titre", { exact: true })
          .fill("Un brouillon mobile");
        await page
          .getByLabel("Description", { exact: true })
          .fill("Du texte visible pendant la saisie.");
        await page.screenshot({
          path: testInfo.outputPath(`saisie-${width}-${theme}.png`),
        });
        await page.locator(".schedule-trigger").click();
        await page.getByRole("tab", { name: "Répéter", exact: true }).click();
        await mobileFields(page);
        await page.getByRole("button", { name: "Fermer", exact: true }).click();
        await page
          .getByRole("button", { name: "Configurer l’espace", exact: true })
          .click();
        await page.getByRole("tab", { name: "Sections", exact: true }).click();
        await mobileFields(page);
        await page.getByRole("button", { name: "Fermer", exact: true }).click();
        await page.locator(".quick-add").first().click();
        await mobileFields(page);
        await expect(
          page.getByRole("textbox", { name: "Nom de la tâche", exact: true }),
        ).toBeFocused();
      }
      await data.mutate(
        "/agenda/view",
        { period: "custom", custom_days: 5, include_overdue: false },
        "PUT",
      );
      await data.open(true);
      await mobileFields(page);
    } finally {
      await data.cleanup();
    }
  });

  test("clavier simulé : ajout rapide, dialogue, déplacement natif et fermeture", async ({
    page,
  }, testInfo) => {
    const resize = await mockViewport(page);
    const visible = async (field: Locator, height: number, top = 0) => {
      await expect
        .poll(async () => {
          const box = (await field.boundingBox())!;
          return box.y >= top + 60 && box.y + box.height < top + height - 32;
        })
        .toBeTruthy();
    };
    await page.goto("/tasks");
    const password = page.getByLabel("Mot de passe");
    await password.fill("Brouillon synthétique");
    await resize(360);
    await visible(password, 360);
    const data = await seed(page);
    try {
      await data.open();
      await page.locator(".quick-add").first().click();
      const quick = page.getByRole("textbox", {
        name: "Nom de la tâche",
        exact: true,
      });
      await quick.fill("Brouillon conservé");
      await resize(470);
      await visible(quick, 470);
      await expect(quick).toBeFocused();
      expect(await page.evaluate(() => innerHeight)).toBe(812);
      // Ordinary scrolling must not pull the user back to the focused input.
      await page.locator(".tasks-main").dispatchEvent("touchmove");
      await page.locator(".tasks-main").evaluate((node) => {
        node.scrollTop -= 200;
      });
      const manual = await scrollTop(page);
      await resize(470, 0, true);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      expect(await scrollTop(page)).toBe(manual);
      await resize(812);
      await expect(quick).toHaveValue("Brouillon conservé");
      await page
        .getByRole("button", { name: "Nouvelle tâche", exact: true })
        .click();
      const description = page.getByLabel("Description", { exact: true });
      await description.fill("Le clavier laisse la description visible.");
      await resize(440, 30);
      await visible(description, 440, 30);
      const dialog = page.getByRole("dialog");
      await expect
        .poll(async () => {
          const box = (await dialog.boundingBox())!;
          return box.y >= 30 && box.y + box.height <= 470;
        })
        .toBeTruthy();
      await page.screenshot({
        path: testInfo.outputPath("clavier-viewport-reduit.png"),
      });
      const priority = page.getByRole("combobox", {
        name: "Priorité",
        exact: true,
      });
      await priority.focus();
      await visible(priority, 440, 30);
      const fieldBox = (await priority.boundingBox())!;
      const footerBox = (await dialog
        .locator(".dialog-actions")
        .boundingBox())!;
      expect(fieldBox.y + fieldBox.height).toBeLessThan(footerBox.y);
      await resize(812);
      await page.getByRole("button", { name: "Fermer", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Nouvelle tâche", exact: true }),
      ).toBeFocused();
      await resize(400, 0, false, 2);
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue(
              "--ui-viewport-height",
            ),
          ),
        )
        .toBe("812px");
    } finally {
      await data.cleanup();
    }
  });

  test("sections : garder la saisie visible après le déplacement tardif du clavier", async ({
    page,
  }, testInfo) => {
    const resize = await mockViewport(page);
    const data = await seed(page, 1);
    try {
      for (const name of ["Maison", "Travail", "Loisirs"])
        await data.mutate(`/workspaces/${data.space.id}/sections`, { name });
      await data.open();
      await page
        .getByRole("button", { name: "Configurer l’espace", exact: true })
        .click();
      await page.getByRole("tab", { name: "Sections", exact: true }).click();
      const dialog = page.getByRole("dialog");
      const visible = async (field: Locator) => {
        await expect(field).toBeFocused();
        await expect
          .poll(() =>
            field.evaluate((node) => {
              const box = node.getBoundingClientRect();
              const dialog = node.closest("dialog")!;
              const header = dialog.querySelector(".dialog-header")!;
              return (
                box.top >= header.getBoundingClientRect().bottom + 8 &&
                box.bottom <= dialog.getBoundingClientRect().bottom - 8
              );
            }),
          )
          .toBeTruthy();
      };
      const second = dialog.getByRole("textbox", {
        name: "Nom Travail",
        exact: true,
      });
      await second.tap();
      await second.fill("Travail en cours");
      await resize(335);
      await visible(second);
      // The OS can finish panning AFTER focus and resize, restoring an older
      // scroller position. A resize-only mock misses the reported hidden field.
      await dialog.evaluate((node) => {
        node.scrollTop = 0;
      });
      await visible(second);
      await resize(335, 80, true);
      await visible(second);
      await expect(second).toHaveValue("Travail en cours");
      await page.screenshot({
        path: testInfo.outputPath("deuxieme-section-clavier.png"),
      });

      const thirdForm = dialog.locator(".entity-form").filter({
        has: page.getByRole("textbox", { name: "Nom Loisirs", exact: true }),
      });
      const description = thirdForm.getByRole("textbox", {
        name: "Description",
        exact: true,
      });
      await dialog.dispatchEvent("touchmove");
      await description.tap();
      await description.fill("Description conservée pendant la saisie.");
      await resize(335, 0, true);
      await visible(description);

      // Scrolling by touch takes precedence over following the focused field.
      await dialog.dispatchEvent("touchmove");
      await dialog.evaluate((node) => {
        node.scrollTop = 0;
      });
      await resize(335, 0, true);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      expect(await dialog.evaluate((node) => node.scrollTop)).toBe(0);
      await expect(description).toBeFocused();
      // Native keyboard input (unlike Locator.fill) does not scroll for the test.
      await page.keyboard.type(" Suite.");
      await visible(description);
      await expect(description).toHaveValue(
        "Description conservée pendant la saisie. Suite.",
      );

      await resize(812);
      const newName = dialog.getByRole("textbox", {
        name: "Nom du nouvel élément",
        exact: true,
      });
      await dialog.dispatchEvent("touchmove");
      await newName.tap();
      await newName.fill("Nouvelle section");
      // Some keyboard geometry becomes available with the later pan event.
      await resize(335, 0, true);
      await visible(newName);
      await dialog.dispatchEvent("wheel", { deltaY: -200 });
      const manualPosition = await dialog.evaluate((node) => {
        node.scrollTop -= 100;
        return node.scrollTop;
      });
      await resize(335, 0, true);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      expect(await dialog.evaluate((node) => node.scrollTop)).toBe(
        manualPosition,
      );
      // Retapping the same field must resume following without a new focusin.
      await newName.tap();
      await dialog.evaluate((node) => {
        node.scrollTop = 0;
      });
      await resize(335, 40, true);
      await visible(newName);
      await resize(812);
      await expect(second).toHaveValue("Travail en cours");
      await dialog.dispatchEvent("touchmove");
      await thirdForm
        .getByRole("button", { name: "Enregistrer", exact: true })
        .click();
      await expect(dialog.getByRole("status")).toHaveText(
        "Modifications enregistrées.",
      );
      const response = await page.request.get(
        `/api/v1/workspaces/${data.space.id}/sections`,
      );
      expect(
        (await response.json()).find(
          (section: { name: string }) => section.name === "Loisirs",
        ).description,
      ).toBe("Description conservée pendant la saisie. Suite.");
      await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Configurer l’espace", exact: true }),
      ).toBeFocused();
    } finally {
      await data.cleanup();
    }
  });

  test("repli sans VisualViewport et rotation en paysage", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "visualViewport", { value: undefined });
    });
    const data = await seed(page, 1);
    try {
      await data.open();
      await page
        .getByRole("button", { name: "Nouvelle tâche", exact: true })
        .click();
      const description = page.getByLabel("Description", { exact: true });
      await description.fill("Brouillon après rotation");
      await page.setViewportSize({ width: 740, height: 360 });
      await expect(description).toBeFocused();
      await mobileFields(page);
      await expect
        .poll(async () => {
          const box = (await description.boundingBox())!;
          return box.y > 60 && box.y + box.height < 340;
        })
        .toBeTruthy();
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(description).toHaveValue("Brouillon après rotation");
      await page.getByRole("button", { name: "Fermer", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await data.cleanup();
    }
  });
});

for (const mobile of [false, true]) {
  test.describe(mobile ? "listes tactiles" : "ordinateur", () => {
    test.use({
      viewport: { width: mobile ? 375 : 1440, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    test("liste et tableau : résolution, réouverture, erreurs et position", async ({
      page,
    }) => {
      const data = await seed(page);
      try {
        for (const layout of ["list", "board"] as const) {
          await data.mutate(
            `/workspaces/${data.space.id}/view`,
            { ...defaultView, layout },
            "PUT",
          );
          await data.open();
          const target = row(page, data.tasks[19]);
          const neighbor = row(page, data.tasks[20]);
          await center(target);
          const before = await scrollTop(page);
          const retained = await neighbor.elementHandle();
          await target.getByRole("checkbox").click();
          await expect(target.getByRole("checkbox")).toHaveAttribute(
            "aria-checked",
            "true",
          );
          expect(await scrollTop(page)).toBeGreaterThan(before - 170);
          expect(
            await retained!.evaluate((node) => node.isConnected),
          ).toBeTruthy();
          if (layout === "list") {
            await target.getByRole("checkbox").click();
            await expect(target.getByRole("checkbox")).toHaveAttribute(
              "aria-checked",
              "false",
            );
            expect(await scrollTop(page)).toBeGreaterThan(before - 170);
          }
          await center(neighbor);
          const failedBefore = await scrollTop(page);
          await page.route(
            `**/api/v1/tasks/${data.tasks[20].id}/complete`,
            (route) =>
              route.fulfill({
                status: 409,
                json: { detail: "Conflit simulé" },
              }),
          );
          await page.route("**/api/v1/tasks?**", (route) =>
            route.fulfill({ status: 503, json: {} }),
          );
          await neighbor.getByRole("checkbox").click();
          await expect(page.getByRole("alert")).toBeVisible();
          await expect(neighbor.getByRole("checkbox")).toHaveAttribute(
            "aria-checked",
            "false",
          );
          expect(
            await retained!.evaluate((node) => node.isConnected),
          ).toBeTruthy();
          expect(await scrollTop(page)).toBeGreaterThan(failedBefore - 170);
          await page.unrouteAll();
        }
        if (!mobile) {
          await expect(page.locator(".task-search-field input")).toHaveCSS(
            "font-size",
            "12px",
          );
          await page
            .getByRole("button", { name: "Nouvelle tâche", exact: true })
            .click();
          await expect(page.getByLabel("Titre", { exact: true })).toHaveCSS(
            "font-size",
            "13px",
          );
          await expect(page.getByLabel("Titre", { exact: true })).toBeFocused();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
        }
      } finally {
        await data.cleanup();
      }
    });
  });
}
