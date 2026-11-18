import { formatLocale } from "../../shared/i18n";
import { resources } from "../../shared/i18n";
import { prefixedLabels } from "./snippets";

function messages(): Record<string, string> {
  return resources[formatLocale() === "en-GB" ? "en" : "fr"];
}
export function detailLabels(): Record<string, string> {
  return prefixedLabels(messages(), "assistant_lifeos_field_");
}
