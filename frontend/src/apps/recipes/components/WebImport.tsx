import { useEffect, useRef, useState } from "react";
import { useApiResource } from "../../../platform/useApiResource";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { recipesApi, webImportApi } from "../api";
import { tr, unitLabel } from "../i18n";
import {
  units,
  type BrowserFrame,
  type ImportedIngredient,
  type Recipe,
  type RecipeImportDraft,
  type Unit,
} from "../types";
import { BrowserPreview } from "./BrowserPreview";
import { useDraft, type DraftProps } from "./common";

function IngredientRow({
  line,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  line: ImportedIngredient;
  index: number;
  disabled: boolean;
  onChange: (line: ImportedIngredient) => void;
  onRemove: () => void;
}) {
  const [matching, setMatching] = useState(false),
    [query, setQuery] = useState(line.name);
  const search = useApiResource(
    (signal) =>
      matching
        ? recipesApi.ingredients(query, 0, signal)
        : Promise.resolve(null),
    [matching, query, line.name],
  );
  useEffect(() => {
    setMatching(false);
    setQuery(line.name);
  }, [line.source_text]);
  return (
    <div className="recipes-web-ingredient">
      <div className="recipes-web-ingredient-main">
        <label>
          <span className="sr-only">
            {tr("web_ingredient_name", { number: index + 1 })}
          </span>
          <input
            required
            maxLength={120}
            value={line.name}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...line,
                name: event.target.value,
                ingredient_id: null,
                catalogue_name: null,
              })
            }
          />
        </label>
        <label>
          <span className="sr-only">
            {tr("quantity")} · {line.name}
          </span>
          <input
            required
            type="number"
            min="0.000001"
            max="1000000000"
            step="0.000001"
            value={line.quantity ?? ""}
            disabled={disabled}
            placeholder="—"
            onChange={(event) =>
              onChange({ ...line, quantity: event.target.value || null })
            }
          />
        </label>
        <label>
          <span className="sr-only">
            {tr("web_unit")} · {line.name}
          </span>
          <select
            required
            value={line.unit ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...line,
                unit: (event.target.value || null) as Unit | null,
              })
            }
          >
            <option value="">{tr("web_choose_unit")}</option>
            {units.map((unit) => (
              <option value={unit} key={unit}>
                {unitLabel(unit)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          disabled={disabled}
          aria-label={tr("remove", { name: line.name })}
          onClick={onRemove}
        >
          <Icon name="x" />
        </button>
      </div>
      <div className="recipes-web-ingredient-meta">
        <span>
          {line.ingredient_id
            ? tr("web_catalogue_match")
            : tr("web_new_ingredient")}
        </span>
        <button
          type="button"
          className="recipes-web-text-button"
          disabled={disabled}
          aria-expanded={matching}
          onClick={() => setMatching(!matching)}
        >
          {tr("web_match_ingredient")}
        </button>
      </div>
      {matching && (
        <div className="recipes-web-matches">
          <label>
            {tr("search")}
            <input
              type="search"
              value={query}
              maxLength={120}
              disabled={disabled}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <ErrorMessage message={search.error} />
          {search.loading ? (
            <p className="muted">{tr("loading")}</p>
          ) : (
            search.data?.items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="secondary-button"
                disabled={disabled}
                onClick={() => {
                  onChange({
                    ...line,
                    name: item.name,
                    ingredient_id: item.id,
                    catalogue_name: item.name,
                  });
                  setMatching(false);
                }}
              >
                {item.name}
              </button>
            ))
          )}
        </div>
      )}
      <details className="recipes-web-source-line">
        <summary>{tr("web_original_line")}</summary>
        <p>{line.source_text}</p>
        {line.note && <p>{line.note}</p>}
      </details>
    </div>
  );
}

export function WebImport({
  onSaved,
  onCancel,
  ...draftProps
}: DraftProps & { onSaved: (recipe: Recipe) => void; onCancel: () => void }) {
  const [url, setUrl] = useState(""),
    [text, setText] = useState(""),
    [paste, setPaste] = useState(false),
    [frame, setFrame] = useState<BrowserFrame>(),
    [draft, setDraft] = useState<RecipeImportDraft>(),
    [busy, setBusy] = useState<"opening" | "preparing" | "saving" | null>(null),
    [browserBusy, setBrowserBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true),
    pending = useRef(false),
    controller = useRef<AbortController | undefined>(undefined),
    session = useRef<string | undefined>(undefined),
    titleInput = useRef<HTMLInputElement>(null),
    preview = useRef<HTMLDivElement>(null);
  useDraft(Boolean(url || text || draft), Boolean(busy), draftProps);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
      if (session.current)
        void webImportApi.close(session.current).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (draft) titleInput.current?.focus();
  }, [Boolean(draft)]);
  async function run<T>(
    kind: NonNullable<typeof busy>,
    operation: (signal: AbortSignal) => Promise<T>,
    accept: (value: T) => void,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(kind);
    setError("");
    const current = new AbortController();
    controller.current = current;
    try {
      const value = await operation(current.signal);
      if (alive.current && !current.signal.aborted) accept(value);
    } catch (e) {
      if (alive.current && !current.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (controller.current === current) {
        pending.current = false;
        if (alive.current) setBusy(null);
      }
    }
  }
  function closeBrowser() {
    const id = session.current;
    session.current = undefined;
    setFrame(undefined);
    if (id) void webImportApi.close(id).catch(() => {});
  }
  function openPage() {
    closeBrowser();
    const id = crypto.randomUUID();
    session.current = id;
    const width = Math.max(
      320,
      Math.min(1280, Math.round(preview.current?.clientWidth ?? 1024)),
    );
    void run(
      "opening",
      (signal) => webImportApi.open(id, url.trim(), width, signal),
      (value) => {
        setFrame(value);
        setPaste(false);
      },
    );
  }
  function prepare() {
    if (!paste && !frame) return;
    const source = paste
      ? { text, source_url: url.trim() || null }
      : { session_id: frame!.id, document: frame!.document };
    void run(
      "preparing",
      (signal) => webImportApi.prepare(source, signal),
      (value) => {
        const notes = value.items
          .filter((line) => line.note)
          .map((line) => `${line.name} : ${line.note}`);
        const instructions = notes.length
          ? `${value.instructions}\n\n${tr("web_ingredient_notes")}\n${notes.join("\n")}`
          : value.instructions;
        setDraft({
          ...value,
          instructions: instructions.slice(0, 20000),
          warnings:
            instructions.length > 20000
              ? [...value.warnings, tr("web_notes_long")]
              : value.warnings,
        });
        closeBrowser();
      },
    );
  }
  const step = draft ? 3 : frame || paste ? 2 : 1;
  return (
    <div className="recipes-web-import" ref={preview}>
      <ol className="recipes-web-steps" aria-label={tr("web_steps")}>
        {(["web_step_open", "web_step_import", "web_step_review"] as const).map(
          (key, index) => (
            <li
              key={key}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {tr(key)}
            </li>
          ),
        )}
      </ol>
      {!draft ? (
        <>
          <div className="recipes-web-intro">
            <span className="recipes-web-mark">
              <Icon name="book" size={26} />
            </span>
            <div>
              <h2>{tr("web_headline")}</h2>
              <p className="muted">{tr("web_subtitle")}</p>
            </div>
          </div>
          <form
            className="recipes-web-url-form"
            onSubmit={(event) => {
              event.preventDefault();
              openPage();
            }}
          >
            <label htmlFor="recipe-web-url">{tr("web_url_label")}</label>
            <div className="recipes-web-url-row">
              <input
                id="recipe-web-url"
                type="url"
                required
                maxLength={2048}
                value={url}
                placeholder="https://…"
                disabled={Boolean(busy)}
                onChange={(event) => setUrl(event.target.value)}
                autoComplete="url"
              />
              <button className="primary-button" disabled={Boolean(busy)}>
                {busy === "opening" ? tr("web_opening") : tr("web_open")}
              </button>
            </div>
          </form>
          <div className="recipes-web-language">
            <Icon name="check" />
            <span>{tr("web_language_hint")}</span>
          </div>
          {frame && !paste && (
            <BrowserPreview
              key={frame.id}
              initial={frame}
              disabled={Boolean(busy)}
              onFrame={setFrame}
              onError={(message, expired) => {
                setError(message);
                if (expired) closeBrowser();
              }}
              onPending={setBrowserBusy}
            />
          )}
          <details
            className="recipes-web-paste"
            open={paste}
            onToggle={(event) => {
              if (!busy) {
                setPaste(event.currentTarget.open);
                if (event.currentTarget.open && session.current) closeBrowser();
              }
            }}
          >
            <summary>{tr("web_paste_fallback")}</summary>
            <label htmlFor="recipe-web-text">{tr("web_paste_label")}</label>
            <textarea
              id="recipe-web-text"
              rows={10}
              maxLength={60000}
              disabled={Boolean(busy)}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={tr("web_paste_placeholder")}
            />
            <p className="muted recipes-small">{tr("web_paste_hint")}</p>
          </details>
          <ErrorMessage message={error} />
          {busy && (
            <div className="recipes-web-loading" role="status">
              <span aria-hidden="true" />
              {tr(
                busy === "opening" ? "web_opening_hint" : "web_preparing_hint",
              )}
            </div>
          )}
          <div className="recipes-web-bottom">
            <p className="muted recipes-small">
              {tr("web_provider_hint")}{" "}
              <a
                href="/settings"
                onClick={(event) => {
                  if (busy || ((url || text) && !window.confirm(tr("unsaved"))))
                    event.preventDefault();
                }}
              >
                {tr("web_settings")}
              </a>
            </p>
            <div className="recipes-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  controller.current?.abort();
                  pending.current = false;
                  setBusy(null);
                  closeBrowser();
                  onCancel();
                }}
              >
                {tr("cancel")}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={
                  Boolean(busy) ||
                  browserBusy ||
                  (paste ? text.trim().length < 20 : !frame)
                }
                onClick={prepare}
              >
                <Icon name="sparkles" />
                {tr("web_import_action")}
              </button>
            </div>
          </div>
        </>
      ) : (
        <form
          className="recipes-web-review"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              "saving",
              (signal) => webImportApi.save(draft, signal),
              onSaved,
            );
          }}
        >
          <div className="recipes-web-review-heading">
            <Icon name="check" />
            <div>
              <h2>{tr("web_review_title")}</h2>
              <p className="muted">{tr("web_review_hint")}</p>
            </div>
          </div>
          {draft.warnings.length > 0 && (
            <aside
              className="recipes-web-warnings"
              aria-label={tr("web_points_to_check")}
            >
              <strong>{tr("web_points_to_check")}</strong>
              <ul>
                {draft.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </aside>
          )}
          <fieldset disabled={Boolean(busy)}>
            <div className="recipes-web-fields">
              <label>
                {tr("title")}
                <input
                  ref={titleInput}
                  required
                  maxLength={160}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
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
                  value={draft.servings ?? ""}
                  placeholder="—"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      servings: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                />
              </label>
            </div>
            <div className="recipes-section-heading">
              <h2>{tr("ingredients")}</h2>
              <span className="muted recipes-small">
                {tr("items", { count: draft.items.length })}
              </span>
            </div>
            <div className="recipes-web-ingredients">
              {draft.items.map((line, index) => (
                <IngredientRow
                  key={`${index}:${line.source_text}`}
                  line={line}
                  index={index}
                  disabled={Boolean(busy)}
                  onChange={(next) =>
                    setDraft({
                      ...draft,
                      items: draft.items.map((item, i) =>
                        i === index ? next : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    setDraft({
                      ...draft,
                      items: draft.items.filter((_, i) => i !== index),
                    })
                  }
                />
              ))}
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={Boolean(busy) || draft.items.length >= 200}
              onClick={() =>
                setDraft({
                  ...draft,
                  items: [
                    ...draft.items,
                    {
                      name: "",
                      ingredient_id: null,
                      catalogue_name: null,
                      quantity: null,
                      unit: null,
                      source_text: "",
                      note: "",
                    },
                  ],
                })
              }
            >
              <Icon name="plus" />
              {tr("web_add_ingredient")}
            </button>
            <label className="recipes-web-instructions">
              {tr("instructions")}
              <textarea
                rows={10}
                maxLength={20000}
                value={draft.instructions}
                onChange={(event) =>
                  setDraft({ ...draft, instructions: event.target.value })
                }
              />
            </label>
            {draft.source_url && (
              <div className="recipes-web-source">
                <span>{tr("web_source")}</span>
                <a
                  href={draft.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {draft.source_title || draft.source_url}
                </a>
              </div>
            )}
          </fieldset>
          <ErrorMessage message={error} />
          <div className="recipes-web-bottom">
            <p className="muted recipes-small">{tr("web_save_hint")}</p>
            <div className="recipes-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (window.confirm(tr("unsaved"))) setDraft(undefined);
                }}
              >
                {tr("web_start_over")}
              </button>
              <button
                className="primary-button"
                disabled={Boolean(busy) || !draft.items.length}
              >
                {busy === "saving" ? tr("saving") : tr("web_save")}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
