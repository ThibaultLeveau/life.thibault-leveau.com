import { tr, type MessageKey } from "../../../shared/i18n";
import { Icon, type IconName } from "../../../shared/ui/Icon";
import type { Application } from "../../applications/types";
const suggestions: { key: MessageKey; icon: IconName; application: string }[] =
  [
    { key: "assistant_prompt_day", icon: "calendar", application: "tasks" },
    { key: "assistant_prompt_goals", icon: "flag", application: "okr" },
    { key: "assistant_prompt_meals", icon: "cart", application: "recipes" },
    { key: "assistant_prompt_memory", icon: "memory", application: "" },
  ];
export function Welcome({
  applications,
  onPrompt,
}: {
  applications: Application[];
  onPrompt: (value: string) => void;
}) {
  return (
    <section className="assistant-welcome">
      <span className="assistant-emblem">
        <Icon name="sparkles" size={32} />
      </span>
      <p className="assistant-eyebrow">{tr("assistant_eyebrow")}</p>
      <h1>{tr("assistant_welcome")}</h1>
      <p className="assistant-intro">{tr("assistant_intro")}</p>
      <div className="assistant-suggestions">
        {suggestions
          .filter(
            (item) =>
              !item.application ||
              applications.some((app) => app.id === item.application),
          )
          .slice(0, 3)
          .map((suggestion) => (
            <button
              key={suggestion.key}
              onClick={() => onPrompt(tr(suggestion.key))}
            >
              <Icon name={suggestion.icon} />
              <span>{tr(suggestion.key)}</span>
              <Icon name="arrow" size={15} />
            </button>
          ))}
      </div>
      {!applications.length && (
        <p className="muted">
          {tr("assistant_no_apps")}{" "}
          <a href="/applications">{tr("open_the_library")}</a>
        </p>
      )}
    </section>
  );
}
