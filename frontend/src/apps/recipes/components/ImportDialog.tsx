import { useState } from "react";
import { useApiAction, useApiResource } from "../../../platform/useApiResource";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { recipesApi } from "../api";
import { number, tr, unitLabel } from "../i18n";
import type { Recipe, ShoppingList } from "../types";
import { LoadState, Pager, useDraft, type DraftProps } from "./common";

export function ImportDialog({
  recipe: fixedRecipe,
  list: fixedList,
  onSaved,
  onClose,
  ...draft
}: DraftProps & {
  recipe?: Recipe;
  list?: ShoppingList;
  onSaved: (list: ShoppingList) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(""),
    [offset, setOffset] = useState(0),
    [chosenRecipe, setRecipe] = useState<Recipe | undefined>(fixedRecipe),
    [chosenList, setList] = useState<ShoppingList | undefined>(fixedList),
    [servings, setServings] = useState(String(fixedRecipe?.servings ?? 2));
  const action = useApiAction();
  useDraft(Boolean(chosenRecipe && chosenList), action.busy, draft);
  const options = useApiResource(
    async (signal) =>
      fixedRecipe
        ? recipesApi.lists("list", false, q, offset, signal)
        : recipesApi.recipes(q, false, offset, signal),
    [fixedRecipe?.id, q, offset],
  );
  const validServings =
    Number.isInteger(Number(servings)) &&
    Number(servings) >= 1 &&
    Number(servings) <= 1000;
  const preview = useApiResource(
    (signal) =>
      chosenRecipe && validServings
        ? recipesApi.recipe(chosenRecipe.id, Number(servings), signal)
        : Promise.resolve(null),
    [chosenRecipe?.id, servings],
  );
  const close = () => {
    if (!action.busy) onClose();
  };
  return (
    <Dialog
      title={tr(fixedRecipe ? "add_to_list" : "import_recipe")}
      onClose={close}
      wide
    >
      <form
        className="recipes-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!chosenList || !preview.data || preview.loading || preview.error)
            return;
          void action.run(
            () =>
              recipesApi.import(chosenList, preview.data!, Number(servings)),
            (result) => {
              onSaved(result);
              onClose();
            },
          );
        }}
      >
        <fieldset disabled={action.busy}>
          <p className="muted">{tr("import_hint")}</p>
          <label>
            {tr("search")}
            <input
              type="search"
              maxLength={160}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <h3>{tr(fixedRecipe ? "choose_list" : "choose_recipe")}</h3>
          <LoadState {...options} />
          <div className="recipes-choice-list">
            {options.data?.items
              .filter((o) => !("completed_at" in o) || !o.completed_at)
              .map((o) => (
                <button
                  type="button"
                  key={o.id}
                  className={
                    chosenRecipe?.id === o.id || chosenList?.id === o.id
                      ? "is-selected"
                      : ""
                  }
                  aria-pressed={
                    chosenRecipe?.id === o.id || chosenList?.id === o.id
                  }
                  onClick={() => {
                    if ("servings" in o) {
                      setRecipe(o);
                      setServings(String(o.base_servings));
                    } else setList(o);
                  }}
                >
                  <strong>{o.title}</strong>
                  <span>
                    {tr("kind" in o ? "shopping_items" : "items", {
                      count: o.items.length,
                    })}
                  </span>
                </button>
              ))}
          </div>
          {options.data && <Pager {...options.data} onChange={setOffset} />}
          {options.data?.total === 0 && (
            <p>{tr(fixedRecipe ? "no_open_lists" : "empty_recipes_hint")}</p>
          )}
          {chosenRecipe && (
            <div className="recipes-import-preview">
              <h3>{chosenRecipe.title}</h3>
              <label>
                {tr("servings")}
                <input
                  type="number"
                  required
                  min={1}
                  max={1000}
                  step={1}
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              </label>
              <LoadState {...preview} />
              <ul>
                {preview.data?.items.map((line) => (
                  <li key={line.id}>
                    <span>{line.name}</span>
                    <strong>
                      {number(line.quantity)} {unitLabel(line.unit)}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ErrorMessage message={action.error} />
          <div className="recipes-actions">
            <button
              className="primary-button"
              disabled={
                !chosenList ||
                !preview.data ||
                !validServings ||
                preview.loading ||
                Boolean(preview.error)
              }
            >
              {action.busy ? tr("saving") : tr("import")}
            </button>
            <button className="secondary-button" type="button" onClick={close}>
              {tr("cancel")}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
