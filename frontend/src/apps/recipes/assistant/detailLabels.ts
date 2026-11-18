import { formatLocale } from "../../../shared/i18n";
import { resources } from "../i18n";
import { prefixedLabels } from "../../../platform/assistant/snippets";

function messages(): Record<string, string> {
  return resources[formatLocale() === "en-GB" ? "en" : "fr"];
}
export function detailLabels(): Record<string, string> {
  return prefixedLabels(messages(), "assistant_field_");
}

export function detailValue(
  key: string,
  value: unknown,
  path: readonly string[],
): string | undefined {
  if (path.includes("values")) return undefined;
  if (
    key === "category" &&
    [
      "produce",
      "fresh",
      "protein",
      "pantry",
      "seasoning",
      "drinks",
      "frozen",
      "household",
      "other",
    ].includes(String(value))
  )
    return messages()[String(value)];
  return messages()[`assistant_value_${key}_${String(value)}`];
}
