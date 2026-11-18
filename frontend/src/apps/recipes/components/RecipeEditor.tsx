import { useCallback, useState } from "react";
import { useApiAction } from "../../../platform/useApiResource";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { recipesApi } from "../api";
import { tr, unitLabel } from "../i18n";
import { itemInput, type Item, type Recipe } from "../types";
import { PreparationEditor } from "./PreparationEditor";
import { IngredientPicker } from "./IngredientPicker";
import { useDraft, type DraftProps } from "./common";

export function RecipeEditor({
  existing,
  onSaved,
  onCancel,
  ...draft
}: DraftProps & {
  existing?: Recipe;
  onSaved: (recipe: Recipe) => void;
  onCancel: () => void;
}) {
  const [baseline, setBaseline] = useState(existing),
    [title, setTitle] = useState(existing?.title ?? ""),
    [servings, setServings] = useState(String(existing?.base_servings ?? 2)),
    [instructions, setInstructions] = useState(existing?.instructions ?? ""),
    [sections, setSections] = useState(existing?.sections ?? []),
    [items, setItems] = useState<Item[]>(existing?.items ?? []);
  const [pickerKey, setPickerKey] = useState(0),
    [dirty, setDirty] = useState(false),
    [pickerDirty, setPickerDirty] = useState(false),
    [pickerBusy, setPickerBusy] = useState(false);
  const action = useApiAction();
  useDraft(dirty || pickerDirty, action.busy || pickerBusy, draft);
  const pickerDirtyChange = useCallback((v: boolean) => setPickerDirty(v), []),
    pickerBusyChange = useCallback((v: boolean) => setPickerBusy(v), []);
  return (
    <form
      className="recipes-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (pickerBusy || pickerDirty) return;
        void action.run(
          () =>
            recipesApi.saveRecipe(
              {
                title,
                servings: Number(servings),
                instructions,
                sections,
                items: items.map(itemInput),
              },
              baseline,
            ),
          onSaved,
        );
      }}
    >
      <fieldset disabled={action.busy || pickerBusy}>
        <div className="recipes-form-grid">
          <label>
            {tr("title")}
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            {tr("servings")}
            <input
              type="number"
              min={1}
              max={1000}
              step={1}
              required
              value={servings}
              onChange={(e) => {
                setServings(e.target.value);
                setDirty(true);
              }}
            />
          </label>
        </div>
        <p className="muted recipes-small">{tr("edit_portions_hint")}</p>
        <h2>{tr("ingredients")}</h2>
        <div className="recipes-draft-items">
          {items.map((item) => (
            <div key={item.id} className="recipes-draft-item">
              <strong>{item.name}</strong>
              <label>
                <span className="sr-only">
                  {tr("quantity")} · {item.name}
                </span>
                <input
                  type="number"
                  min="0.000001"
                  max="1000000000"
                  step="0.000001"
                  required
                  value={item.quantity}
                  onChange={(e) => {
                    setItems((all) =>
                      all.map((i) =>
                        i.id === item.id
                          ? { ...i, quantity: e.target.value }
                          : i,
                      ),
                    );
                    setDirty(true);
                  }}
                />
              </label>
              <span>{unitLabel(item.unit)}</span>
              <button
                className="icon-button"
                type="button"
                aria-label={tr("remove", { name: item.name })}
                onClick={() => {
                  setItems(items.filter((i) => i.id !== item.id));
                  setDirty(true);
                }}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
        {!items.length && <p className="muted">{tr("no_ingredients")}</p>}
      </fieldset>
      <IngredientPicker
        key={pickerKey}
        disabled={action.busy}
        onDirty={pickerDirtyChange}
        onBusy={pickerBusyChange}
        onAdd={async (item) => {
          setItems((all) => [...all, item]);
          setDirty(true);
          return true;
        }}
      />
      <fieldset disabled={action.busy || pickerBusy}>
        <PreparationEditor
          key={pickerKey}
          instructions={instructions}
          sections={sections}
          onChange={(value) => {
            setInstructions(value.instructions);
            setSections(value.sections);
            setDirty(true);
          }}
        />
        <ErrorMessage message={action.error} />
        {action.error && baseline && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if ((dirty || pickerDirty) && !window.confirm(tr("unsaved")))
                return;
              void action.run(
                () => recipesApi.recipe(baseline.id),
                (fresh) => {
                  setBaseline(fresh);
                  setTitle(fresh.title);
                  setServings(String(fresh.base_servings));
                  setInstructions(fresh.instructions);
                  setSections(fresh.sections);
                  setItems(fresh.items);
                  setDirty(false);
                  setPickerKey((key) => key + 1);
                },
              );
            }}
          >
            {tr("refresh")}
          </button>
        )}
        {pickerDirty && (
          <p className="muted recipes-small">{tr("choose_ingredient")}</p>
        )}
        <div className="recipes-actions">
          <button
            className="primary-button"
            disabled={!items.length || pickerDirty}
          >
            {action.busy ? tr("saving") : tr("save")}
          </button>
          <button className="secondary-button" type="button" onClick={onCancel}>
            {tr("cancel")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
