import { expect, type Locator, type Page } from "@playwright/test";

export async function openSportFilters(page: Page) {
  await expect(
    page.locator(".sport-list-controls, .sport-measure-options").first(),
  ).toBeVisible();
  const toggle = page.getByRole("button", {
    name: /^(Filtres|Filters)(\s+\d+)?$/,
  });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) === "false"
  )
    await toggle.click();
}
export async function openSportActions(row: Locator) {
  await expect(row).toBeVisible();
  const toggle = row.getByRole("button", {
    name: /^(Actions pour |Actions for )/,
  });
  if (await toggle.isVisible()) await toggle.click();
}
export async function openProgramOptions(page: Page) {
  const options = page.locator(".sport-program-options");
  if (!(await options.evaluate((el) => (el as HTMLDetailsElement).open)))
    await options.locator("summary").click();
}
export async function expectPickerFocus(page: Page) {
  const mobile = await page.evaluate(
    () =>
      matchMedia(
        "(max-width: 800px), (pointer: coarse) and (max-width: 1024px) and (max-height: 500px)",
      ).matches,
  );
  if (mobile) {
    // Opening the catalogue should show results before summoning a keyboard.
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: /^(Fermer|Close)$/ }),
    ).toBeFocused();
  } else await expect(page.getByLabel("Rechercher un exercice")).toBeFocused();
}
