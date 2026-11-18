import { expect, test } from "@playwright/test";
import type { Snippet } from "../src/platform/assistant/types";
import { fixture } from "./assistant-fixture";

const longText =
  "Une instruction détaillée à conserver intégralement. ".repeat(45) +
  "FIN DU TEXTE COMPLET";
const rows = Array.from({ length: 12 }, (_, i) => ({
  name: `Ingrédient ${i + 1}`,
  title: `Résultat ${i + 1}`,
  quantity: i ? "1.250000" : "350.000000",
  unit: "g",
  current: i + 0.125,
  target: 10,
  sets: 3,
  target_values: { weight_kg: 12.5 },
}));
function card(
  application_id: string,
  entity: unknown,
  extra: Partial<Snippet> = {},
): Snippet {
  return {
    id: application_id,
    application_id,
    kind: "read",
    schema_version: 1,
    phase: "result",
    data: { title: `Carte ${application_id}`, entity },
    ...extra,
  };
}
const cards: Snippet[] = [
  card("tasks", {
    title: "Tâche complète",
    description: longText,
    due_date: "2026-11-18",
    priority: 0,
  }),
  card("sport", {
    name: "Programme complet",
    notes: longText,
    entries: rows.map((row, i) => ({
      ...row,
      name: `Exercice ${i + 1}`,
      target: { weight_kg: 12.5, reps: 8 },
    })),
  }),
  card("tracking", {
    definition: {
      name: "Suivi complet",
      description: longText,
      fields: [
        { id: "energy", label: "Énergie ressentie", kind: "number" },
        { id: "done", label: "Objectif validé", kind: "boolean" },
      ],
    },
    values: { energy: 0, done: false },
    score: 8.25,
  }),
  card("okr", {
    title: "Objectif complet",
    why: longText,
    first_action: "Un premier pas",
    progress: 25,
    key_results: rows,
  }),
  card("recipes", {
    title: "Recette complète",
    servings: 2,
    instructions: longText,
    items: [
      ...rows.map(({ name, quantity, unit }) => ({
        name,
        quantity,
        unit,
        category: "produce",
      })),
      { name: "Épice précise", quantity: "0.000001", unit: "mg" },
      { name: "Cuillère finale", quantity: "0.500000", unit: "tbsp" },
    ],
  }),
  card("lifeos", {
    timezone: "Europe/Paris",
    vacations: Array.from({ length: 12 }, (_, i) => ({
      start: `2026-12-${String(i + 1).padStart(2, "0")}`,
      end: `2026-12-${String(i + 1).padStart(2, "0")}`,
    })),
    usage_days: { tasks: [0, 2, 6] },
  }),
];

test("les consultations sont repliées, toutes les confirmations restent visibles et l’historique conserve les détails", async ({
  page,
}) => {
  const data = await fixture(page);
  const reads = cards.map((item) => ({
    ...item,
    data: { ...(item.data as object), read_only: true },
  }));
  const previews = Array.from({ length: 4 }, (_, i) =>
    card(
      "tasks",
      { title: `Proposition ${i + 1}` },
      {
        id: `proposal-${i}`,
        phase: "preview",
        operation_id: `operation-${i}`,
      },
    ),
  );
  data.seed("conversation-1", [...reads, ...previews]);
  await page.goto("/ai?conversation=conversation-1");
  await expect(
    page.getByRole("button", { name: "Confirmer ce changement" }),
  ).toHaveCount(4);
  await expect(page.locator(".assistant-snippet:visible")).toHaveCount(4);
  const summary = page.locator(".assistant-consultations > summary");
  await expect(summary).toHaveText("6 consultations");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".assistant-snippet:visible")).toHaveCount(10);
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".assistant-snippet:visible")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".assistant-consultations")).not.toHaveAttribute(
    "open",
  );
  await expect(page.locator(".assistant-snippet:visible")).toHaveCount(4);
  expect(data.requests.filter((item) => item.method !== "GET")).toHaveLength(0);
  let confirmations = 0;
  await page.route(
    "**/api/v1/assistant/operations/operation-3/confirm",
    async (route) => {
      confirmations++;
      const receipt: Snippet = { ...previews[3], phase: "result" };
      for (const message of data.conversations.get("conversation-1")!.messages)
        message.snippets = message.snippets.map((item) =>
          item.id === receipt.id ? receipt : item,
        );
      await route.fulfill({
        json: {
          operation_id: "operation-3",
          status: "complete",
          result: {},
          snippet: receipt,
        },
      });
    },
  );
  await page
    .getByRole("button", { name: "Confirmer ce changement" })
    .last()
    .click();
  const confirmed = page
    .locator(".assistant-snippet")
    .filter({ hasText: "Proposition 4" });
  await expect(confirmed).toBeVisible();
  await expect(confirmed.locator(".assistant-snippet-phase")).toHaveText(
    "Résultat",
  );
  await expect(confirmed).toBeFocused();
  await expect(page.locator(".assistant-snippet:visible")).toHaveCount(4);
  expect(confirmations).toBe(1);
});

for (const locale of ["fr", "en"])
  for (const theme of ["light", "dark", "system"])
    for (const width of [320, 1440])
      test(`détails des six snippets : ${locale}, ${theme}, ${width} px`, async ({
        page,
      }, info) => {
        test.setTimeout(90_000);
        const data = await fixture(page);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        data.seed("conversation-1", cards);
        data.session.locale = locale;
        data.session.theme = theme;
        await page.emulateMedia({
          reducedMotion: "reduce",
          colorScheme: "dark",
        });
        await page.setViewportSize({ width, height: 1000 });
        await page.goto("/ai?conversation=conversation-1");
        await page.locator(".assistant-snippets-more").click();
        await expect(page.locator(".assistant-snippet:visible")).toHaveCount(6);
        for (let index = 0; index < cards.length; index++) {
          const snippet = page.locator(".assistant-snippet").nth(index);
          const toggle = snippet.locator(
            ".assistant-snippet-details > summary",
          );
          await expect(toggle).toBeVisible();
          expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(
            44,
          );
          await toggle.focus();
          await page.keyboard.press("Enter");
          const details = snippet.locator(".assistant-snippet-details-body");
          await expect(details).toBeVisible();
          if (index < 5)
            await expect(details).toContainText("FIN DU TEXTE COMPLET");
          if (index === 1) await expect(details).toContainText("Exercice 12");
          if (index === 2) {
            await expect(details).toContainText("Énergie ressentie");
            await expect(details).toContainText(locale === "fr" ? "Non" : "No");
          }
          if (index === 3) await expect(details).toContainText("Résultat 12");
          if (index === 4) {
            await expect(snippet).not.toContainText("350.000000");
            await expect(details).toContainText("Cuillère finale");
            await expect(details).toContainText(
              locale === "fr" ? "Fruits & légumes" : "Fruit & vegetables",
            );
            await expect(details).toContainText(
              locale === "fr" ? "0,000001" : "0.000001",
            );
            await expect(details).toContainText(
              locale === "fr" ? "c. à soupe" : "tbsp",
            );
          }
          if (index === 5)
            await expect(
              details
                .locator(".assistant-detail-list")
                .first()
                .locator(":scope > li"),
            ).toHaveCount(12);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          // No detail panel introduces an inner scrollbar or clips the full text.
          expect(
            await details.evaluate(
              (element) => element.scrollWidth <= element.clientWidth,
            ),
          ).toBe(true);
          if (
            locale === "fr" &&
            ((theme === "light" && width === 1440) ||
              (theme === "dark" && width === 320))
          ) {
            await toggle.click();
            await snippet.screenshot({
              path: info.outputPath(
                `${cards[index].application_id}-${theme}-${width}.png`,
              ),
            });
            await toggle.click();
          }
          await toggle.focus();
          await page.keyboard.press("Space");
          await expect(details).toHaveCount(0);
          await expect(toggle).toBeFocused();
        }
        expect(errors).toEqual([]);
      });

test("le texte long se déplie sans scroll imbriqué et reste intégral après rechargement", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", [cards[4]]);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/ai?conversation=conversation-1");
  const button = page.getByRole("button", { name: "Lire le texte complet" });
  await button.focus();
  await page.keyboard.press("Enter");
  const full = page.locator(".assistant-snippet-text > span");
  await expect(full.first()).toHaveText(/FIN DU TEXTE COMPLET$/);
  await expect(full.first()).not.toHaveClass("is-collapsed");
  expect(
    await full
      .first()
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
  await page.getByRole("button", { name: "Réduire le texte" }).click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await button.click();
  await expect(full.first()).toHaveText(/FIN DU TEXTE COMPLET$/);
});

test("pages complètes, états vides, version inconnue et application désactivée", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", [
    card("recipes", { items: rows, total: 40, offset: 0, limit: 12 }),
  ]);
  await page.goto("/ai?conversation=conversation-1");
  await page.locator(".assistant-snippet-details > summary").click();
  await expect(
    page.getByText("12 sur 40 résultats dans cette consultation."),
  ).toBeVisible();
  await expect(page.locator(".assistant-snippet-details-body")).toContainText(
    "Ingrédient 12",
  );
  for (const item of cards) {
    data.seed("conversation-1", [card(item.application_id, [])]);
    await page.reload();
    await expect(page.getByText("Aucun élément à afficher.")).toBeVisible();
  }
  data.seed("conversation-1", [{ ...cards[4], schema_version: 99 }]);
  await page.reload();
  await expect(page.locator(".assistant-snippet-details")).toHaveCount(0);
  data.seed("conversation-1", [cards[4]]);
  await page.route("**/api/v1/applications", async (route) => {
    // Existing fixture owns the API; explicit catalog for this disabled state.
    await route.fulfill({
      json: [
        {
          id: "recipes",
          name: "Recettes",
          icon: "cart",
          path: "/recipes",
          enabled: false,
        },
      ],
    });
  });
  await page.reload();
  await expect(page.locator(".assistant-snippet-details")).toHaveCount(0);
  await expect(page.getByText("Recette complète", { exact: true })).toHaveCount(
    0,
  );
});

test("les champs personnels conservent leurs libellés par objet et leurs valeurs même avec des noms techniques", async ({
  page,
}) => {
  const data = await fixture(page);
  data.seed("conversation-1", [
    card("tracking", [
      {
        id: "reference-technique-masquee",
        definition: {
          name: "Matin",
          fields: [
            { id: "current", label: "Code personnel", kind: "note" },
            { id: "energy", label: "Énergie du matin" },
            { id: "id", label: "Mon nombre" },
            { id: "constructor", label: "Mon choix" },
          ],
        },
        values: {
          energy: 0,
          id: 7,
          constructor: "Personnel",
          current: "007",
          due_date: "2026-11-18",
          tiny: 0.0000001,
        },
      },
      {
        definition: {
          name: "Soir",
          fields: [{ id: "energy", label: "Énergie du soir" }],
        },
        values: { energy: 8 },
      },
    ]),
  ]);
  await page.goto("/ai?conversation=conversation-1");
  await page.locator(".assistant-snippet-details > summary").click();
  const details = page.locator(".assistant-snippet-details-body");
  await expect(page.locator(".assistant-snippet-summary")).toContainText("007");
  await expect(details).toContainText("0,0000001");
  await expect(
    details.getByText("Énergie du matin", { exact: true }),
  ).toHaveCount(2);
  await expect(
    details.getByText("Énergie du soir", { exact: true }),
  ).toHaveCount(2);
  await expect(details.getByText("7", { exact: true })).toBeVisible();
  await expect(details).not.toContainText("reference-technique-masquee");
  await expect(details.getByText("Personnel", { exact: true })).toBeVisible();
  await expect(details.getByText("007", { exact: true })).toBeVisible();
  await expect(details.getByText("2026-11-18", { exact: true })).toBeVisible();
});
