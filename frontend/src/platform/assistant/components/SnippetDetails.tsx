import { useState } from "react";
import { formatLocale, resources, tr } from "../../../shared/i18n";
import { Icon } from "../../../shared/ui/Icon";
import { number, prefixedLabels, record, text } from "../snippets";

export type DetailLabels = Record<string, string>;

// References and storage metadata are available through the API, not useful card content.
const metadata = new Set([
  "id",
  "version",
  "expected_version",
  "position",
  "offset",
  "limit",
  "builtin",
  "icon",
  "path",
  "color",
  "name_fr",
  "name_en",
  "server_now",
  "server_today",
]);
const numericStrings = new Set([
  "quantity",
  "purchased_quantity",
  "current",
  "target",
  "start",
  "upper",
]);

function isMetadata(key: string) {
  return metadata.has(key) || /_ids?$/.test(key);
}
function populated(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.some(populated);
  if (typeof value === "object")
    return Object.entries(record(value)).some(([, item]) => populated(item));
  return true;
}
export function SnippetDetails({
  value,
  labels = {},
  formatValue,
}: {
  value: unknown;
  labels?: DetailLabels;
  formatValue?: (
    key: string,
    value: unknown,
    path: readonly string[],
  ) => string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const language = formatLocale() === "en-GB" ? "en" : "fr";
  const common: DetailLabels = prefixedLabels(
    resources[language],
    "assistant_field_",
  );
  const states: DetailLabels = prefixedLabels(
    resources[language],
    "assistant_state_",
  );
  function label(key: string, names: Map<string, string>) {
    return (
      names.get(key) ??
      (Object.hasOwn(labels, key) ? labels[key] : undefined) ??
      (Object.hasOwn(common, key) ? common[key] : undefined) ??
      key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
    );
  }
  function scalar(item: unknown, key: string, path: string[]): string {
    const formatted = formatValue?.(key, item, path);
    if (formatted !== undefined) return formatted;
    if (typeof item === "string" && path.includes("values")) return item;
    if (typeof item === "boolean")
      return tr(item ? "assistant_value_yes" : "assistant_value_no");
    if (
      typeof item === "number" ||
      (numericStrings.has(key) && number(item) !== "")
    )
      return number(item) || text(item);
    if (
      typeof item === "string" &&
      /(?:^date$|_at$|_on$|_date$|^since$|^until$|^start$|^end$|^period_start$|^period_end$|^effective_from$)/.test(
        key,
      ) &&
      /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(item)
    ) {
      const parsed = new Date(item.length === 10 ? `${item}T12:00:00` : item);
      if (!Number.isNaN(parsed.getTime()))
        return new Intl.DateTimeFormat(formatLocale(), {
          dateStyle: "medium",
          ...(item.length > 10 ? { timeStyle: "short" as const } : {}),
        }).format(parsed);
    }
    if (
      key === "status" &&
      typeof item === "string" &&
      Object.hasOwn(states, item)
    )
      return states[item];
    return text(item) || "—";
  }
  function render(
    item: unknown,
    key = "",
    path: string[] = [],
    inheritedNames = new Map<string, string>(),
  ): React.ReactNode {
    if (Array.isArray(item))
      return item.length ? (
        <ol className="assistant-detail-list">
          {item.map((child, i) => (
            <li key={i}>{render(child, key, path, inheritedNames)}</li>
          ))}
        </ol>
      ) : (
        <span className="muted">{tr("assistant_details_empty")}</span>
      );
    if (item !== null && typeof item === "object") {
      const object = record(item);
      const names = new Map(inheritedNames);
      // Scope dynamic field labels to this object and its direct definitions.
      // Sibling objects can use the same field ID with different personal labels.
      for (const candidate of [object, ...Object.values(object).map(record)]) {
        if (Array.isArray(candidate.fields))
          for (const field of candidate.fields) {
            const definition = record(field);
            if (
              typeof definition.id === "string" &&
              typeof definition.label === "string"
            )
              names.set(definition.id, definition.label);
          }
      }
      const entries = Object.entries(object).filter(
        ([field, child]) =>
          (key === "values" || names.has(field) || !isMetadata(field)) &&
          populated(child),
      );
      return entries.length ? (
        <dl className="assistant-detail-fields">
          {entries.map(([field, child]) => (
            <div key={field}>
              <dt>{label(field, names)}</dt>
              <dd>{render(child, field, [...path, field], names)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="muted">{tr("assistant_details_empty")}</span>
      );
    }
    return <span>{scalar(item, key, path)}</span>;
  }
  const page = record(value);
  const emptyPage =
    Array.isArray(page.items) &&
    !page.items.length &&
    !page.title &&
    !page.name;
  if (!populated(value) || emptyPage)
    return <p className="muted small-text">{tr("assistant_details_empty")}</p>;
  const collection = Array.isArray(value)
    ? value
    : Object.values(page).find(Array.isArray);
  return (
    <details
      className="assistant-snippet-details"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <Icon name="down" size={14} />
        {tr(expanded ? "assistant_details_less" : "assistant_details_more")}
        {Array.isArray(collection) && (
          <span className="muted">
            {tr("assistant_details_items", { count: collection.length })}
          </span>
        )}
      </summary>
      {expanded && (
        <div className="assistant-snippet-details-body">
          {Array.isArray(page.items) &&
            typeof page.total === "number" &&
            page.total > page.items.length && (
              <p className="muted">
                {tr("assistant_page_count", {
                  shown: page.items.length,
                  total: page.total,
                })}
              </p>
            )}
          {render(value)}
        </div>
      )}
    </details>
  );
}
