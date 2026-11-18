import { useState } from "react";
import { tr } from "../../../shared/i18n";
import { Icon } from "../../../shared/ui/Icon";
import type { ApplicationModule } from "../../applications/definition";
import type { Snippet } from "../types";
import { record } from "../snippets";
import { SnippetHost } from "./SnippetHost";
export function MessageSnippets({
  snippets,
  modules,
  busy,
  onChanged,
  beforeChange,
  onBusy,
}: {
  snippets: Snippet[];
  modules: ApplicationModule[];
  busy: boolean;
  onChanged: () => void;
  beforeChange: () => boolean;
  onBusy: (id: string, busy: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [consultationsExpanded, setConsultationsExpanded] = useState(false);
  // Only final reads are tucked away; malformed/unknown cards and previews stay visible.
  const consultations = snippets.filter(
    (item) =>
      item.phase === "result" &&
      item.schema_version === 1 &&
      record(item.data).read_only === true,
  );
  const changes = snippets.filter((item) => !consultations.includes(item));
  const visible = changes.filter(
    (item, index) => expanded || index < 3 || item.phase === "preview",
  );
  const remaining = changes.length - visible.length;
  return (
    <>
      {visible.map((snippet) => (
        <SnippetHost
          key={snippet.id}
          snippet={snippet}
          modules={modules}
          disabled={busy}
          onChanged={onChanged}
          beforeChange={beforeChange}
          onBusy={onBusy}
        />
      ))}
      {remaining > 0 && (
        <button
          className="secondary-button assistant-snippets-more"
          onClick={() => setExpanded(true)}
        >
          <Icon name="down" size={15} />
          {tr("assistant_more_snippets", { count: remaining })}
        </button>
      )}
      {!!consultations.length && (
        <details
          className="assistant-consultations"
          onToggle={(event) => setConsultationsExpanded(event.currentTarget.open)}
        >
          <summary>
            <Icon name="book" size={15} />
            {tr("assistant_consultations", { count: consultations.length })}
            <Icon name="down" size={14} />
          </summary>
          {consultationsExpanded &&
            consultations.map((snippet) => (
              <SnippetHost
                key={snippet.id}
                snippet={snippet}
                modules={modules}
                disabled={busy}
                onChanged={onChanged}
                beforeChange={beforeChange}
                onBusy={onBusy}
              />
            ))}
        </details>
      )}
    </>
  );
}
