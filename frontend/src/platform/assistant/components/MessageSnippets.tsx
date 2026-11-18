import { useState } from "react";
import { tr } from "../../../shared/i18n";
import { Icon } from "../../../shared/ui/Icon";
import type { ApplicationModule } from "../../applications/definition";
import type { Snippet } from "../types";
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
  const visible = expanded ? snippets : snippets.slice(0, 3);
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
      {!expanded && snippets.length > 3 && (
        <button
          className="secondary-button assistant-snippets-more"
          onClick={() => setExpanded(true)}
        >
          <Icon name="down" size={15} />
          {tr("assistant_more_snippets", { count: snippets.length - 3 })}
        </button>
      )}
    </>
  );
}
