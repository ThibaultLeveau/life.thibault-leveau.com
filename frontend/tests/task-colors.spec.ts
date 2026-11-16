import { test, expect, type Locator, type Page } from "@playwright/test";

async function save(page: Page, button: Locator, path: string, method: string) {
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1${path}`) &&
      response.request().method() === method,
  );
  await button.click();
  const result = await response;
  expect(result.ok(), await result.text()).toBeTruthy();
  return result.json();
}

for (const locale of ["fr", "en"] as const) {
  for (const mobile of [false, true]) {
    test.describe(`${locale}, ${mobile ? "mobile 320 px" : "ordinateur"}`, () => {
      test.use({
        viewport: { width: mobile ? 320 : 1440, height: mobile ? 740 : 1000 },
        isMobile: mobile,
        hasTouch: mobile,
      });

      test("palette et couleur libre : création, édition, API et rechargement", async ({
        page,
      }, testInfo) => {
        const fr = locale === "fr";
        const text = {
          newWorkspace: fr ? "Nouvel espace" : "New workspace",
          workspaceName: fr ? "Nom de l’espace" : "Workspace name",
          createWorkspace: fr ? "Créer l’espace" : "Create workspace",
          settings: fr ? "Configurer l’espace" : "Configure workspace",
          color: fr ? "Couleur" : "Color",
          custom: fr ? "Couleur personnalisée" : "Custom color",
          blue: fr ? "Bleu (#3B82B6)" : "Blue (#3B82B6)",
          purple: fr ? "Violet (#8B5CA6)" : "Purple (#8B5CA6)",
          save: fr ? "Enregistrer" : "Save",
          add: fr ? "Ajouter" : "Add",
          close: fr ? "Fermer" : "Close",
        };
        const login = await page.request.post("/api/v1/auth/session", {
          data: {
            username: process.env.LIFE_E2E_USERNAME ?? "browser-test",
            password:
              process.env.LIFE_E2E_PASSWORD ?? "synthetic-browser-password",
          },
        });
        expect(login.ok()).toBeTruthy();
        const { csrf_token } = await login.json();
        const mutate = async (path: string, data: unknown, method = "PUT") => {
          const response = await page.request.fetch(`/api/v1${path}`, {
            method,
            data,
            headers: { "X-CSRF-Token": csrf_token },
          });
          expect(response.ok(), await response.text()).toBeTruthy();
        };
        const preferences = await (
          await page.request.get("/api/v1/preferences")
        ).json();
        let workspaceId: string | undefined;
        try {
          await mutate("/preferences", {
            locale,
            theme: fr ? (mobile ? "dark" : "light") : "system",
          });
          await page.emulateMedia({ colorScheme: fr ? "light" : "dark" });
          await page.goto("/tasks");
          if (mobile) await page.locator("#tasks-content-menu").click();
          await page
            .getByRole("button", { name: text.newWorkspace, exact: true })
            .click();
          const dialog = page.getByRole("dialog");
          const picker = dialog.getByRole("group", {
            name: text.color,
            exact: true,
          });
          const custom = picker.getByLabel(new RegExp(text.custom));
          await expect(picker.getByRole("button")).toHaveCount(16);
          await expect(custom).toHaveValue("#c05a45");
          const palette = await picker
            .getByRole("button")
            .evaluateAll((buttons) =>
              buttons.map((button) => getComputedStyle(button).backgroundColor),
            );
          await dialog
            .getByLabel(text.workspaceName)
            .fill(`Palette ${locale} ${mobile} ${Date.now()}`);
          const blue = picker.getByRole("button", {
            name: text.blue,
            exact: true,
          });
          if (mobile) {
            await blue.tap();
          } else {
            await blue.focus();
            await page.keyboard.press("Enter");
          }
          await expect(blue).toHaveAttribute("aria-pressed", "true");
          await expect(custom).toHaveValue("#3b82b6");
          await expect(
            dialog.getByRole("button", {
              name: text.createWorkspace,
              exact: true,
            }),
          ).toBeVisible();
          await custom.fill("#123456");
          await expect(
            picker.getByRole("button", { pressed: true }),
          ).toHaveCount(0);
          await expect(
            picker.getByText("#123456", { exact: true }),
          ).toBeVisible();
          await blue.click();
          const space = await save(
            page,
            dialog.getByRole("button", {
              name: text.createWorkspace,
              exact: true,
            }),
            "/workspaces",
            "POST",
          );
          workspaceId = space.id;
          expect(space.color).toBe("#3b82b6");
          await page
            .getByRole("button", { name: text.settings, exact: true })
            .click();
          await expect(custom).toHaveValue("#3b82b6");
          await expect(blue).toHaveAttribute("aria-pressed", "true");
          await custom.fill("#123456");
          const updated = await save(
            page,
            dialog.getByRole("button", { name: text.save, exact: true }),
            `/workspaces/${space.id}`,
            "PATCH",
          );
          expect(updated.color).toBe("#123456");
          await dialog
            .getByRole("button", { name: text.close, exact: true })
            .click();
          await page.reload();
          await page
            .getByRole("button", { name: text.settings, exact: true })
            .click();
          await expect(custom).toHaveValue("#123456");
          await expect(
            picker.getByRole("button", { pressed: true }),
          ).toHaveCount(0);

          // Staying on the same tab keeps the draft; leaving it discards all fields.
          await blue.click();
          await dialog
            .getByRole("tab", {
              name: fr ? "Espace" : "Workspace",
              exact: true,
            })
            .click();
          await expect(custom).toHaveValue("#3b82b6");
          await dialog
            .getByRole("tab", { name: "Sections", exact: true })
            .click();
          await dialog
            .getByRole("tab", {
              name: fr ? "Espace" : "Workspace",
              exact: true,
            })
            .click();
          await expect(custom).toHaveValue("#123456");

          for (const [kind, tab] of [
            ["sections", "Sections"],
            ["statuses", fr ? "Colonnes" : "Columns"],
            ["labels", fr ? "Étiquettes" : "Labels"],
          ] as const) {
            await dialog.getByRole("tab", { name: tab, exact: true }).click();
            const form = dialog.locator("form").last();
            const newPicker = form.getByRole("group");
            expect(
              await newPicker
                .getByRole("button")
                .evaluateAll((buttons) =>
                  buttons.map(
                    (button) => getComputedStyle(button).backgroundColor,
                  ),
                ),
            ).toEqual(palette);
            await form.locator('input[name="name"]').fill(`Palette ${kind}`);
            const purple = newPicker.getByRole("button", {
              name: text.purple,
              exact: true,
            });
            if (mobile) await purple.tap();
            else {
              await purple.focus();
              await page.keyboard.press("Space");
            }
            await expect(
              newPicker.getByLabel(new RegExp(text.custom)),
            ).toHaveValue("#8b5ca6");
            const item = await save(
              page,
              form.getByRole("button", { name: text.add, exact: true }),
              `/workspaces/${space.id}/${kind}`,
              "POST",
            );
            expect(item.color).toBe("#8b5ca6");
            await expect(form.locator('input[name="name"]')).toHaveValue("");
            await expect(
              newPicker.getByLabel(new RegExp(text.custom)),
            ).toHaveValue("#748b79");
            const existing = dialog.locator("form").filter({
              has: page.locator(`input[name="name"][value="Palette ${kind}"]`),
            });
            const existingPicker = existing.getByRole("group");
            await expect(
              existingPicker.getByRole("button", {
                name: text.purple,
                exact: true,
              }),
            ).toHaveAttribute("aria-pressed", "true");
            await existingPicker
              .getByLabel(new RegExp(text.custom))
              .fill("#a1b2c3");
            const edited = await save(
              page,
              existing.getByRole("button", { name: text.save, exact: true }),
              `/workspaces/${space.id}/${kind}/${item.id}`,
              kind === "labels" ? "PUT" : "PATCH",
            );
            expect(edited.color).toBe("#a1b2c3");
            const savedItems = await (
              await page.request.get(`/api/v1/workspaces/${space.id}/${kind}`)
            ).json();
            expect(
              savedItems.find((saved: { id: string }) => saved.id === item.id)
                .color,
            ).toBe("#a1b2c3");
            const targets = await existingPicker
              .locator('button, input[type="color"]')
              .evaluateAll((nodes) =>
                nodes.map((node) => ({
                  width: node.getBoundingClientRect().width,
                  height: node.getBoundingClientRect().height,
                })),
              );
            expect(
              targets.every(({ width, height }) => width >= 44 && height >= 44),
            ).toBeTruthy();
            expect(
              await dialog.evaluate(
                (node) => node.scrollWidth <= node.clientWidth,
              ),
            ).toBeTruthy();
            if (kind === "sections") {
              await existingPicker.scrollIntoViewIfNeeded();
              await existingPicker.screenshot({
                path: testInfo.outputPath("palette.png"),
              });
            }
          }
          await dialog
            .getByRole("button", { name: text.close, exact: true })
            .click();
          await page.reload();
          await page
            .getByRole("button", { name: text.settings, exact: true })
            .click();
          await expect(custom).toHaveValue("#123456");
          await dialog
            .getByRole("tab", { name: "Sections", exact: true })
            .click();
          const savedSection = dialog.getByRole("group", {
            name: `${text.color} Palette sections`,
            exact: true,
          });
          await expect(
            savedSection.getByLabel(new RegExp(text.custom)),
          ).toHaveValue("#a1b2c3");
          await expect(
            savedSection.getByRole("button", { pressed: true }),
          ).toHaveCount(0);
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
          await expect(
            page.getByRole("button", { name: text.settings, exact: true }),
          ).toBeFocused();
        } finally {
          if (workspaceId)
            await mutate(
              `/workspaces/${workspaceId}`,
              { archived: true },
              "PATCH",
            );
          await mutate("/preferences", {
            locale: preferences.locale,
            theme: preferences.theme,
          });
        }
      });
    });
  }
}
