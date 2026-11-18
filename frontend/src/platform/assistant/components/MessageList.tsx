import { tr } from "../../../shared/i18n";
import { Icon } from "../../../shared/ui/Icon";
import type { ApplicationModule } from "../../applications/definition";
import type { Message } from "../types";
import { MessageText } from "./MessageText";
import { MessageSnippets } from "./MessageSnippets";
export function MessageList({
  messages,
  modules,
  busy,
  streaming,
  onChanged,
  beforeChange,
  onBusy,
}: {
  messages: Message[];
  modules: ApplicationModule[];
  busy: boolean;
  streaming: boolean;
  onChanged: () => void;
  beforeChange: () => boolean;
  onBusy: (id: string, busy: boolean) => void;
}) {
  return (
    <div
      className="assistant-messages"
      role="log"
      aria-live="off"
      aria-label={tr("assistant_history")}
    >
      {messages.map((message) => (
        <article
          key={message.id}
          className={`assistant-message is-${message.role}`}
        >
          {message.role === "assistant" && (
            <span className="assistant-message-avatar">
              <Icon name="sparkles" size={17} />
            </span>
          )}
          <div className="assistant-message-body">
            <span className="sr-only">
              {message.role === "assistant" ? "LifeOS" : tr("assistant_you")}
            </span>
            <MessageText content={message.content} />
            <MessageSnippets
              snippets={message.snippets ?? []}
              modules={modules}
              busy={busy}
              onChanged={onChanged}
              beforeChange={beforeChange}
              onBusy={onBusy}
            />
            {message.status === "interrupted" && (
              <p className="assistant-message-notice">
                {tr("assistant_interrupted")}
              </p>
            )}
            {message.status === "failed" && (
              <p className="assistant-message-notice">
                {tr("assistant_failed")}
              </p>
            )}
            {message.status === "running" && !streaming && (
              <p className="assistant-message-notice" role="status">
                {tr("assistant_recovering")}
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
