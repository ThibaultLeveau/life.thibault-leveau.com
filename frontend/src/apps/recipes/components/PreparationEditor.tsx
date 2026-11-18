import { useId, useLayoutEffect, useRef, useState } from "react";
import { tr } from "../i18n";
import type { PreparationSection } from "../types";

function TextBlock({
  label,
  value,
  onChange,
  onSplit,
  canAdd,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSplit: (position: number) => void;
  canAdd: boolean;
  required?: boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  return (
    <div className="recipes-text-block">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        ref={field}
        className="recipes-preparation-input"
        rows={6}
        required={required}
        maxLength={20000}
        value={value}
        placeholder={tr("instructions_hint")}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="recipes-web-text-button"
        disabled={!canAdd || !value.length}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onSplit(field.current?.selectionStart ?? 0)}
      >
        {tr("section_split")}
      </button>
    </div>
  );
}

export function PreparationEditor({
  instructions,
  sections,
  onChange,
}: {
  instructions: string;
  sections: PreparationSection[];
  onChange: (value: {
    instructions: string;
    sections: PreparationSection[];
  }) => void;
}) {
  // Stable, transient keys preserve the field/caret when a section moves.
  const [keys, setKeys] = useState(() =>
    sections.map(() => crypto.randomUUID()),
  );
  const [focus, setFocus] = useState<string | null>(null);
  const titles = useRef(new Map<string, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const total =
    instructions.length +
    sections.reduce((sum, section) => sum + section.text.length, 0);
  useLayoutEffect(() => {
    if (focus === "add") addButton.current?.focus();
    else if (focus) titles.current.get(focus)?.focus();
    setFocus(null);
  }, [focus]);
  const update = (index: number, value: Partial<PreparationSection>) =>
    onChange({
      instructions,
      sections: sections.map((section, i) =>
        i === index ? { ...section, ...value } : section,
      ),
    });
  function insert(index: number, text = "", before?: string) {
    const key = crypto.randomUUID();
    const next = [...sections];
    if (before !== undefined && index > 0)
      next[index - 1] = { ...next[index - 1], text: before };
    next.splice(index, 0, { title: "", text });
    const nextKeys = [...keys];
    nextKeys.splice(index, 0, key);
    setKeys(nextKeys);
    onChange({
      instructions: before !== undefined && index === 0 ? before : instructions,
      sections: next,
    });
    setFocus(key);
  }
  function move(index: number, direction: number) {
    const next = [...sections],
      nextKeys = [...keys];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    [nextKeys[index], nextKeys[index + direction]] = [
      nextKeys[index + direction],
      nextKeys[index],
    ];
    setKeys(nextKeys);
    onChange({ instructions, sections: next });
    setFocus(keys[index]);
  }
  return (
    <div className="recipes-preparation-editor">
      <TextBlock
        label={tr("instructions")}
        value={instructions}
        canAdd={sections.length < 50}
        onChange={(value) => onChange({ instructions: value, sections })}
        onSplit={(position) =>
          insert(
            0,
            instructions.slice(position),
            instructions.slice(0, position),
          )
        }
      />
      <p className="muted recipes-small">{tr("sections_hint")}</p>
      <div className="recipes-preparation-sections">
        {sections.map((section, index) => (
          <section
            className="recipes-preparation-section"
            key={keys[index]}
            aria-label={tr("section_number", { count: index + 1 })}
          >
            <div className="recipes-preparation-heading">
              <h3>{tr("section_number", { count: index + 1 })}</h3>
              <div className="recipes-actions">
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === 0}
                  aria-label={tr("section_up", { count: index + 1 })}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === sections.length - 1}
                  aria-label={tr("section_down", { count: index + 1 })}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={tr("section_remove", { count: index + 1 })}
                  onClick={() => {
                    if (
                      (section.title || section.text) &&
                      !window.confirm(tr("section_remove_confirm"))
                    )
                      return;
                    onChange({
                      instructions,
                      sections: sections.filter((_, i) => i !== index),
                    });
                    setKeys(keys.filter((_, i) => i !== index));
                    setFocus(keys[index + 1] ?? keys[index - 1] ?? "add");
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            <label>
              {tr("section_title", { count: index + 1 })}
              <input
                required
                maxLength={160}
                value={section.title}
                ref={(node) => {
                  if (node) titles.current.set(keys[index], node);
                  else titles.current.delete(keys[index]);
                }}
                onChange={(event) =>
                  update(index, { title: event.target.value })
                }
              />
            </label>
            <TextBlock
              required
              label={tr("section_text", { count: index + 1 })}
              value={section.text}
              canAdd={sections.length < 50}
              onChange={(value) => update(index, { text: value })}
              onSplit={(position) =>
                insert(
                  index + 1,
                  section.text.slice(position),
                  section.text.slice(0, position),
                )
              }
            />
          </section>
        ))}
      </div>
      <button
        ref={addButton}
        type="button"
        className="secondary-button"
        disabled={sections.length >= 50}
        onClick={() => insert(sections.length)}
      >
        {tr("section_add")}
      </button>
      <p
        className={total > 20000 ? "error-message" : "muted recipes-small"}
        aria-live="polite"
      >
        {tr("preparation_count", { count: total })}
      </p>
    </div>
  );
}
