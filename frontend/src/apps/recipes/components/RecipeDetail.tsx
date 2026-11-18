import { useCallback, useState } from "react";
import { useApiAction, useApiResource } from "../../../platform/useApiResource";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { recipesApi } from "../api";
import { number, tr, unitLabel } from "../i18n";
import type { Recipe, ShoppingList } from "../types";
import { History, LoadState, useDraft, type DraftProps } from "./common";
import { ImportDialog } from "./ImportDialog";

export function RecipeDetail({
  recipe,
  onEdit,
  onChanged,
  onList,
  ...draft
}: DraftProps & {
  recipe: Recipe;
  onEdit: () => void;
  onChanged: () => void;
  onList: (list: ShoppingList) => void;
}) {
  const [servings, setServings] = useState(String(recipe.base_servings)),
    [importing, setImporting] = useState(false),
    [modalDirty, setModalDirty] = useState(false),
    [modalBusy, setModalBusy] = useState(false);
  const valid =
    Number.isInteger(Number(servings)) &&
    Number(servings) >= 1 &&
    Number(servings) <= 1000;
  const preview = useApiResource(
    (signal) =>
      valid
        ? recipesApi.recipe(recipe.id, Number(servings), signal)
        : Promise.resolve(null),
    [recipe.id, recipe.version, servings],
  );
  const action = useApiAction();
  const onModalDirty = useCallback((v: boolean) => setModalDirty(v), []);
  const onModalBusy = useCallback((v: boolean) => setModalBusy(v), []);
  useDraft(modalDirty, modalBusy || action.busy, draft);
  return (
    <>
      <div className="recipes-actions recipes-detail-actions">
        <button
          className="primary-button"
          disabled={
            action.busy ||
            !!recipe.archived_at ||
            !valid ||
            preview.loading ||
            !preview.data ||
            Boolean(preview.error)
          }
          onClick={() => setImporting(true)}
        >
          <Icon name="cart" />
          {tr("add_to_list")}
        </button>
        {!recipe.archived_at && (
          <button
            className="secondary-button"
            disabled={action.busy}
            onClick={onEdit}
          >
            <Icon name="edit" />
            {tr("edit")}
          </button>
        )}
        <button
          className="secondary-button"
          disabled={action.busy}
          onClick={() =>
            void action.run(
              () => recipesApi.archiveRecipe(recipe, !recipe.archived_at),
              onChanged,
            )
          }
        >
          <Icon name={recipe.archived_at ? "restore" : "archive"} />
          {tr(recipe.archived_at ? "restore" : "archive")}
        </button>
      </div>
      <ErrorMessage message={action.error} />
      <div className="recipes-detail-grid">
        <section className="recipes-panel">
          <div className="recipes-section-heading">
            <h2>{tr("ingredients")}</h2>
            <Icon name="book" />
          </div>
          <label className="recipes-servings">
            {tr("servings")}
            <input
              type="number"
              min={1}
              max={1000}
              step={1}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </label>
          <p className="muted recipes-small">
            {tr("base_servings", { count: recipe.base_servings })}.{" "}
            {tr("portions_hint")}
          </p>
          <LoadState {...preview} />
          <ul className="recipes-ingredient-list">
            {preview.data?.items.map((line) => (
              <li key={line.id}>
                <span>{line.name}</span>
                <strong>
                  {number(line.quantity)} <small>{unitLabel(line.unit)}</small>
                </strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="recipes-panel">
          <h2>{tr("instructions")}</h2>
          <div className="recipes-instructions">
            {recipe.instructions || tr("no_instructions")}
          </div>
        </section>
      </div>
      {recipe.source_url && (
        <p className="recipes-web-source">
          <span>{tr("web_source")}</span>
          <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">
            {recipe.source_title || recipe.source_url}
          </a>
        </p>
      )}
      <History id={recipe.id} type="recipes" version={recipe.version} />
      {importing && preview.data && (
        <ImportDialog
          recipe={preview.data}
          onSaved={onList}
          onClose={() => setImporting(false)}
          onDirty={onModalDirty}
          onBusy={onModalBusy}
        />
      )}
    </>
  );
}
