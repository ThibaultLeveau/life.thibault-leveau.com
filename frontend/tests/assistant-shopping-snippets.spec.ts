import { expect, test } from "@playwright/test";
import type { Snippet } from "../src/platform/assistant/types";
import { fixture } from "./assistant-fixture";

const shopping = {
  title: "Liste de courses",
  kind: "list",
  completed_at: null,
  created_at: "2026-11-18T12:00:00Z",
  items: [
    "steaks hachés",
    "crème semi-épaisse",
    "jambon",
    "pain",
    "céréales protéinées",
    "Lessive " + "concentrée ".repeat(18),
    "Épice précise",
    "Dernier article",
  ].map((name, i) => ({
    id: `item-${i}`,
    ingredient_id: null,
    name,
    quantity: i === 6 ? "0.000001" : "1.000000",
    unit: i === 6 ? "mg" : "u",
    checked: i === 3,
    purchased_quantity: i === 3 ? "1" : i === 7 ? "0.5" : "0",
    category: i === 5 ? "household" : "other",
    position: i,
  })),
};
function card(entity: unknown, extra: Partial<Snippet> = {}): Snippet {
  return {
    id: "shopping-receipt",
    application_id: "recipes",
    kind: "recipes__create_list",
    schema_version: 1,
    phase: "result",
    data: { title: "Créer une liste de courses", entity },
    ...extra,
  };
}

for (const locale of ["fr", "en"])
  for (const theme of ["light", "dark", "system"])
    for (const width of [320, 1440])
      test(`courses compactes : ${locale}, ${theme}, ${width} px`, async ({
        page,
      }, info) => {
        const data = await fixture(page);
        data.session.locale = locale;
        data.session.theme = theme;
        data.seed("conversation-1", [card(shopping)]);
        await page.emulateMedia({
          colorScheme: "dark",
          reducedMotion: "reduce",
        });
        await page.setViewportSize({ width, height: 1000 });
        await page.goto("/?conversation=conversation-1");
        const snippet = page.locator(".assistant-snippet");
        const title = snippet.locator(".assistant-snippet-line");
        await expect(title).toHaveText("Liste de courses");
        await expect(title.locator(".assistant-snippet-dot")).toHaveCount(0);
        const rows = snippet.locator(".recipes-snippet-items > li");
        await expect(rows).toHaveCount(5);
        await expect(rows.locator(".assistant-snippet-dot")).toHaveCount(5);
        const first = rows.first();
        const name = (await first
          .locator(".recipes-snippet-item-name")
          .boundingBox())!;
        const quantity = (await first
          .locator(".recipes-snippet-item-quantity")
          .boundingBox())!;
        expect(Math.abs(name.y - quantity.y)).toBeLessThan(2);
        expect((await first.boundingBox())!.height).toBeLessThan(32);
        await expect(rows.nth(3)).toContainText(
          locale === "fr" ? "Acheté" : "Bought",
        );
        await expect(rows.nth(0)).toContainText(
          locale === "fr" ? "À acheter" : "To buy",
        );
        const toggle = snippet.locator(".assistant-snippet-details > summary");
        await expect(toggle).toContainText("8");
        expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        const capture =
          locale === "fr" &&
          ((width === 320 && theme === "dark") ||
            (width === 1440 && theme === "light"));
        if (capture)
          await snippet.screenshot({
            path: info.outputPath("shopping-collapsed.png"),
          });
        await toggle.focus();
        await page.keyboard.press("Enter");
        const details = snippet.locator(".assistant-snippet-details-body");
        const articles = details.locator(".assistant-detail-list > li");
        await expect(articles).toHaveCount(8);
        await expect(articles.nth(5)).toContainText(shopping.items[5].name);
        await expect(articles.nth(7)).toContainText("Dernier article");
        await expect(articles.nth(7)).toContainText(
          locale === "fr" ? "0,5 u dans le panier" : "0.5 u in the basket",
        );
        await expect(articles.nth(0)).toContainText(
          locale === "fr" ? "0 u dans le panier" : "0 u in the basket",
        );
        await expect(articles.nth(6)).toContainText(
          locale === "fr" ? "0,000001 mg" : "0.000001 mg",
        );
        await expect(articles.nth(5)).toContainText(
          locale === "fr" ? "Maison & hygiène" : "Household & toiletries",
        );
        await expect(details).toContainText("2026");
        await expect(details).not.toContainText("1.000000");
        expect((await articles.first().boundingBox())!.height).toBeLessThan(
          width === 320 ? 100 : 75,
        );
        expect(
          await details.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(
          snippet.getByRole("link", { name: /Ouvrir|Open/ }),
        ).toHaveAttribute("href", "/recipes");
        if (capture)
          await snippet.screenshot({
            path: info.outputPath("shopping-expanded.png"),
          });
        await toggle.focus();
        await page.keyboard.press("Space");
        await expect(details).toHaveCount(0);
        await expect(toggle).toBeFocused();
        await page.reload();
        await expect(rows).toHaveCount(5);
        expect(
          data.requests.filter((request) => request.method !== "GET"),
        ).toEqual([]);
      });

test("modèles, aperçu sans reçu et pages conservent les articles, champs et dates", async ({
  page,
}) => {
  const data = await fixture(page);
  const template = {
    ...shopping,
    kind: "template",
    title: "Modèle personnel",
    completed_at: "2026-11-18T14:00:00Z",
  };
  data.seed("conversation-1", [
    card(template, {
      phase: "preview",
      operation_id: "preview-shopping",
      data: {
        title: "Créer un modèle",
        entity: null,
        arguments: { payload: template },
      },
    }),
  ]);
  await page.goto("/?conversation=conversation-1");
  await expect(
    page.getByRole("button", { name: "Confirmer ce changement" }),
  ).toBeVisible();
  await expect(page.locator(".assistant-snippet-dot")).toHaveCount(0);
  await expect(page.locator(".recipes-snippet-items > li")).toHaveCount(5);
  await page.locator(".assistant-snippet-details > summary").click();
  await expect(page.locator(".assistant-snippet-details-body")).toContainText(
    "Dernier article",
  );

  const lists = Array.from({ length: 4 }, (_, i) => ({
    ...shopping,
    title: `Liste ${i + 1}`,
    items: [
      {
        ...shopping.items[0],
        name: "Liste de courses",
        note: "Information conservée",
      },
    ],
  }));
  data.seed("conversation-1", [
    card({ items: lists, total: 10, limit: 4, offset: 0 }),
  ]);
  await page.reload();
  await expect(page.locator(".recipes-snippet-items > li")).toHaveCount(3);
  await expect(page.locator(".assistant-snippet-dot")).toHaveCount(3);
  await page.locator(".assistant-snippet-details > summary").click();
  const details = page.locator(".assistant-snippet-details-body");
  await expect(details).toContainText("4 sur 10 résultats");
  await expect(details).toContainText("Liste 4");
  await expect(
    details.getByText("Information conservée", { exact: true }),
  ).toHaveCount(4);
  await expect(
    details.getByText("Liste de courses · 1 u", { exact: true }),
  ).toHaveCount(4);

  data.seed("conversation-1", [card({ ...shopping, items: [] })]);
  await page.reload();
  await expect(page.locator(".recipes-snippet-items > li")).toHaveCount(0);
  await expect(page.locator(".assistant-snippet-dot")).toHaveCount(0);
});

test("le résumé conserve les noms longs et les grandes quantités à 320 px", async ({
  page,
}) => {
  const data = await fixture(page);
  const name = "ArticleSansEspace".repeat(12);
  data.seed("conversation-1", [
    card({
      ...shopping,
      items: [
        { ...shopping.items[0], name, quantity: "999999.123456", unit: "tbsp" },
        {
          ...shopping.items[1],
          name: "Une petite quantité",
          quantity: "0.000001",
          unit: "mg",
        },
      ],
    }),
  ]);
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/?conversation=conversation-1");
  const rows = page.locator(".recipes-snippet-items > li");
  await expect(rows.first()).toContainText(name);
  await expect(rows.first()).toContainText("c. à soupe");
  await expect(rows.nth(1)).toContainText("0,000001 mg");
  for (const element of [
    rows.first(),
    rows.first().locator(".recipes-snippet-item-name"),
    rows.first().locator(".recipes-snippet-item-quantity"),
  ]) {
    expect(
      await element.evaluate(
        (node) =>
          node.scrollWidth <= node.clientWidth &&
          node.scrollHeight <= node.clientHeight,
      ),
    ).toBe(true);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
