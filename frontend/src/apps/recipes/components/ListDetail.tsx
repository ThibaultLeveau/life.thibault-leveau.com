import { useCallback, useState } from "react";
import { useApiAction } from "../../../platform/useApiResource";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { recipesApi } from "../api";
import { dateLabel, number, tr } from "../i18n";
import { itemInput, type Item, type Kind, type ShoppingList } from "../types";
import { IngredientPicker } from "./IngredientPicker";
import { ImportDialog } from "./ImportDialog";
import { History, NameDialog, useDraft, type DraftProps } from "./common";

const categories = [
  "produce",
  "fresh",
  "protein",
  "pantry",
  "seasoning",
  "drinks",
  "frozen",
  "household",
  "other",
] as const;

export function ListDetail({
  list,
  shop,
  onShop,
  onChanged,
  onCopy,
  ...draft
}: DraftProps & {
  list: ShoppingList;
  shop: boolean;
  onShop: (shop: boolean) => void;
  onChanged: (list: ShoppingList) => void;
  onCopy: (list: ShoppingList) => void;
}) {
  const [onlyRemaining, setOnlyRemaining] = useState(false),
    [modal, setModal] = useState<"import" | "rename" | Kind | null>(null);
  const [pickerDirty, setPickerDirty] = useState(false),
    [pickerBusy, setPickerBusy] = useState(false),
    [modalDirty, setModalDirty] = useState(false),
    [modalBusy, setModalBusy] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [amount, setAmount] = useState("");
  const action = useApiAction();
  const busy = action.busy || pickerBusy || modalBusy;
  useDraft(pickerDirty || modalDirty || editing !== null, busy, draft);
  const onPickerDirty = useCallback((v: boolean) => setPickerDirty(v), []),
    onPickerBusy = useCallback((v: boolean) => setPickerBusy(v), []),
    onModalDirty = useCallback((v: boolean) => setModalDirty(v), []),
    onModalBusy = useCallback((v: boolean) => setModalBusy(v), []);
  const modalDraft = { onDirty: onModalDirty, onBusy: onModalBusy };
  const editable = !list.archived_at && !list.completed_at;
  const checked = list.items.filter((line) => line.checked).length;
  function mutate(operation: () => Promise<ShoppingList>) {
    void action.run(operation, onChanged);
  }
  function openModal(value: typeof modal) {
    if (!busy && (!editing || window.confirm(tr("unsaved")))) {
      setEditing(null);
      setModal(value);
    }
  }
  function row(item: Item) {
    const Row = list.kind === "template" ? "div" : "label";
    const remaining =
      Math.round(
        (Number(item.quantity) - Number(item.purchased_quantity)) * 1e6,
      ) / 1e6;
    return (
      <li
        key={item.id}
        className={`recipes-shopping-item ${item.checked ? "is-checked" : ""}`}
      >
        <Row className="recipes-check-line">
          {list.kind === "list" && (
            <>
              <input
                id={`recipes-item-${item.id}`}
                type="checkbox"
                checked={item.checked}
                disabled={!editable || busy}
                onChange={() => {
                  void action.run(
                    () => recipesApi.check(list, item.id, !item.checked),
                    (value) => {
                      onChanged(value);
                      if (shop)
                        requestAnimationFrame(() => {
                          const next = value.items.find(
                            (line) => !line.checked,
                          );
                          document
                            .getElementById(
                              next
                                ? `recipes-item-${next.id}`
                                : "recipes-finish",
                            )
                            ?.focus({ preventScroll: true });
                        });
                    },
                  );
                }}
              />
              <span className="recipes-check-mark" aria-hidden="true">
                <Icon name="check" />
              </span>
            </>
          )}
          <span className="recipes-item-name">
            {item.name}
            {Number(item.purchased_quantity) > 0 && !item.checked && (
              <small>
                {tr("partial", {
                  quantity: number(item.purchased_quantity),
                  unit: item.unit,
                  total: number(item.quantity),
                })}
              </small>
            )}
          </span>
          <strong>
            {number(shop && !item.checked ? remaining : item.quantity)}{" "}
            <small>{item.unit}</small>
          </strong>
        </Row>
        {!shop && editable && (
          <div className="recipes-item-actions">
            <button
              className="icon-button"
              disabled={busy}
              aria-label={`${tr("edit")} · ${item.name}`}
              onClick={() => {
                if (
                  editing &&
                  editing !== item.id &&
                  !window.confirm(tr("unsaved"))
                )
                  return;
                setEditing(item.id);
                setAmount(item.quantity);
              }}
            >
              <Icon name="edit" />
            </button>
            <button
              className="icon-button"
              disabled={busy}
              aria-label={tr("remove", { name: item.name })}
              onClick={() => mutate(() => recipesApi.removeItem(list, item.id))}
            >
              <Icon name="x" />
            </button>
          </div>
        )}
        {editing === item.id && (
          <form
            className="recipes-item-edit"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(
                () => recipesApi.editItem(list, item.id, amount),
                (value) => {
                  onChanged(value);
                  setEditing(null);
                },
              );
            }}
          >
            <label>
              {tr("quantity")}
              <input
                autoFocus
                type="number"
                min="0.000001"
                max="1000000000"
                step="0.000001"
                required
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <button className="primary-button" disabled={busy}>
              {tr("save")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              {tr("cancel")}
            </button>
          </form>
        )}
      </li>
    );
  }
  const remainingItems = list.items.filter((i) => !i.checked),
    purchasedItems = list.items.filter((i) => i.checked);
  return (
    <div className={shop ? "recipes-shop" : "recipes-preparation"}>
      <div className="recipes-actions recipes-detail-actions">
        {list.kind === "list" && editable && (
          <button
            className={shop ? "secondary-button" : "primary-button"}
            onClick={() => onShop(!shop)}
          >
            <Icon name={shop ? "edit" : "cart"} />
            {tr(shop ? "prepare" : "shop")}
          </button>
        )}
        {!shop && (
          <>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => openModal("list")}
            >
              <Icon name="copy" />
              {tr(list.kind === "template" ? "use_template" : "copy_list")}
            </button>
            {list.kind === "list" && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => openModal("template")}
              >
                {tr("save_template")}
              </button>
            )}
            {editable && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => openModal("rename")}
              >
                {tr("rename")}
              </button>
            )}
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                mutate(() => recipesApi.archiveList(list, !list.archived_at))
              }
            >
              <Icon name={list.archived_at ? "restore" : "archive"} />
              {tr(list.archived_at ? "restore" : "archive")}
            </button>
          </>
        )}
        {list.completed_at && !list.archived_at && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => mutate(() => recipesApi.complete(list, false))}
          >
            {tr("reopen")}
          </button>
        )}
      </div>
      {list.completed_at && (
        <p className="recipes-notice">
          <Icon name="check" />
          {tr("finished_on", { date: dateLabel(list.completed_at) })}
        </p>
      )}
      {list.kind === "list" && (
        <div className="recipes-basket-status">
          <div>
            <strong role="status">
              {tr("progress", { done: checked, total: list.items.length })}
            </strong>
            {shop && <p>{tr("shop_hint")}</p>}
          </div>
          <progress
            max={Math.max(1, list.items.length)}
            value={checked}
            aria-label={tr("progress", {
              done: checked,
              total: list.items.length,
            })}
          />
        </div>
      )}
      <ErrorMessage message={action.error} />
      <div className="recipes-list-grid">
        <section className="recipes-list-body">
          {shop && (
            <label className="recipes-filter">
              <input
                type="checkbox"
                checked={onlyRemaining}
                onChange={(e) => setOnlyRemaining(e.target.checked)}
              />
              {tr("only_remaining")}
            </label>
          )}
          {!list.items.length && (
            <p className="recipes-empty-inline">{tr("no_ingredients")}</p>
          )}
          {shop && list.items.length > 0 && remainingItems.length === 0 && (
            <p className="recipes-complete-message">
              <Icon name="check" size={26} />
              {tr("all_purchased")}
            </p>
          )}
          {categories.map((category) => {
            const items = (shop ? remainingItems : list.items).filter(
              (i) => i.category === category,
            );
            return items.length ? (
              <section className="recipes-aisle" key={category}>
                <h2>
                  {tr(category)}
                  <span>{items.length}</span>
                </h2>
                <ul>{items.map(row)}</ul>
              </section>
            ) : null;
          })}
          {shop && !onlyRemaining && purchasedItems.length > 0 && (
            <section className="recipes-aisle recipes-purchased">
              <h2>
                {tr("purchased")}
                <span>{purchasedItems.length}</span>
              </h2>
              <ul>{purchasedItems.map(row)}</ul>
            </section>
          )}
          {list.kind === "list" && editable && list.items.length > 0 && (
            <div className="recipes-finish">
              <button
                id="recipes-finish"
                className="primary-button"
                disabled={busy || checked !== list.items.length}
                onClick={() => mutate(() => recipesApi.complete(list, true))}
              >
                <Icon name="check" />
                {tr("complete")}
              </button>
              {shop && (
                <p className="muted recipes-small">{tr("network_hint")}</p>
              )}
            </div>
          )}
        </section>
        {editable && (
          <aside className="recipes-add-panel">
            <h2>{tr("ingredients")}</h2>
            <IngredientPicker
              disabled={action.busy || modalBusy}
              onDirty={onPickerDirty}
              onBusy={onPickerBusy}
              onAdd={async (item) => {
                const value = await recipesApi.addItem(list, itemInput(item));
                onChanged(value);
                return true;
              }}
            />
            <button
              className="secondary-button recipes-import-button"
              disabled={busy}
              onClick={() => openModal("import")}
            >
              <Icon name="book" />
              {tr("import_recipe")}
            </button>
            <p className="muted recipes-small">{tr("stack_hint")}</p>
          </aside>
        )}
      </div>
      {!shop && <History id={list.id} type="lists" version={list.version} />}
      {modal === "import" && (
        <ImportDialog
          list={list}
          onSaved={onChanged}
          onClose={() => setModal(null)}
          {...modalDraft}
        />
      )}
      {modal && modal !== "import" && (
        <NameDialog
          title={tr(
            modal === "rename"
              ? "rename"
              : modal === "template"
                ? "save_template"
                : list.kind === "template"
                  ? "use_template"
                  : "copy_list",
          )}
          initial={
            modal === "rename"
              ? list.title
              : tr("copy_title", { name: list.title })
          }
          hint={modal === "rename" ? undefined : tr("copy_hint")}
          onSave={async (name) => {
            const result =
              modal === "rename"
                ? await recipesApi.renameList(list, name)
                : await recipesApi.copyList(list, name, modal);
            if (modal === "rename") onChanged(result);
            else onCopy(result);
          }}
          onClose={() => setModal(null)}
          {...modalDraft}
        />
      )}
    </div>
  );
}
