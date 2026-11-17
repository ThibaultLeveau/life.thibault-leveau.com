import { useEffect, useRef, useState } from "react";
import { useApiAction, useApiResource } from "../../../platform/useApiResource";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { recipesApi } from "../api";
import { tr } from "../i18n";
import type { Ingredient, Item, Unit } from "../types";
import { LoadState, Pager, useDraft, type DraftProps } from "./common";

export function IngredientPicker({
  onAdd,
  disabled = false,
  ...draft
}: DraftProps & {
  onAdd: (item: Item) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Ingredient | null>(null),
    [amount, setAmount] = useState("1"),
    [unit, setUnit] = useState<Unit>("g");
  const [touched, setTouched] = useState(false),
    [adding, setAdding] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    quantity = useRef<HTMLInputElement>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setOffset(0);
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);
  const resource = useApiResource(
    (signal) => recipesApi.ingredients(search, offset, signal),
    [search, offset],
  );
  const action = useApiAction();
  const busy = action.busy || adding;
  useDraft(touched, busy, draft);
  const choose = (item: Ingredient) => {
    setSelected(item);
    setQ(item.name);
    setUnit(item.unit);
    setTouched(true);
    setError("");
    quantity.current?.focus();
  };
  const exact = resource.data?.items.some((item) =>
    [item.name_fr, item.name_en].some(
      (name) => name.toLocaleLowerCase() === q.trim().toLocaleLowerCase(),
    ),
  );
  async function add() {
    if (busy || disabled) return;
    if (!selected) {
      setError(tr("choose_ingredient"));
      input.current?.focus();
      return;
    }
    if (!quantity.current?.reportValidity()) return;
    setAdding(true);
    setError("");
    try {
      const ok = await onAdd({
        id: crypto.randomUUID(),
        ingredient_id: selected.id,
        name: selected.name,
        category: selected.category,
        quantity: amount,
        unit,
        position: 0,
        purchased_quantity: "0",
        checked: false,
      });
      if (alive.current && ok) {
        setSelected(null);
        setQ("");
        setAmount("1");
        setTouched(false);
        input.current?.focus();
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setAdding(false);
    }
  }
  return (
    <div className="recipes-picker">
      <fieldset disabled={disabled || busy}>
        <label>
          {tr("ingredient")}
          <input
            ref={input}
            type="search"
            maxLength={120}
            placeholder={tr("ingredient_hint")}
            autoComplete="off"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSelected(null);
              setTouched(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (selected) void add();
              }
            }}
          />
        </label>
        {!selected && q.trim() && (
          <div className="recipes-suggestions">
            <LoadState {...resource} />
            {!resource.loading &&
              resource.data?.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => choose(item)}
                >
                  <span>{item.name}</span>
                  <small>
                    {item.unit} · {tr(item.builtin ? "catalogue" : "personal")}
                  </small>
                </button>
              ))}
            {resource.data && <Pager {...resource.data} onChange={setOffset} />}
          </div>
        )}
        <div className="recipes-quantity-fields">
          <label>
            {tr("quantity")}
            <input
              ref={quantity}
              type="number"
              inputMode="decimal"
              min="0.000001"
              max="1000000000"
              step="0.000001"
              required
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setTouched(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                }
              }}
            />
          </label>
          <label>
            {tr("unit")}
            <select
              aria-label={tr("unit")}
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value as Unit);
                setTouched(true);
              }}
            >
              {(["g", "l", "u"] as const).map((u) => (
                <option key={u} value={u}>
                  {tr(`unit_${u}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => void add()}
            disabled={!selected}
          >
            <Icon name="plus" />
            {busy ? tr("saving") : tr("add")}
          </button>
        </div>
        {!selected &&
          q.trim() &&
          search === q &&
          !resource.loading &&
          !resource.error &&
          !exact && (
            <div className="recipes-create-ingredient">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void action.run(
                    () => recipesApi.ingredient(q.trim(), unit),
                    choose,
                  )
                }
              >
                <Icon name="plus" />
                {tr("create_ingredient", { name: q.trim() })}
              </button>
              <p className="muted">{tr("new_ingredient_hint")}</p>
            </div>
          )}
        <ErrorMessage message={error || action.error} />
        {touched && (
          <button
            type="button"
            className="recipes-reload"
            onClick={() => {
              setQ("");
              setSelected(null);
              setAmount("1");
              setTouched(false);
              setError("");
            }}
          >
            {tr("cancel")}
          </button>
        )}
      </fieldset>
    </div>
  );
}
