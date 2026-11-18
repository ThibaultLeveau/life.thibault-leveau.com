import { useId, useState, type ReactNode } from "react";
import { tr } from "../i18n";
import { Icon, type IconName } from "./Icon";
export function SnippetSummary({
  icon,
  children,
}: {
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <div className="assistant-snippet-summary">
      <span className="assistant-snippet-symbol">
        <Icon name={icon} />
      </span>
      <div>{children}</div>
    </div>
  );
}
export function SnippetText({ children }: { children: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const long = children.length > 180 || children.split("\n").length > 3;
  return (
    <span className="assistant-snippet-text">
      <span id={id} className={long && !expanded ? "is-collapsed" : undefined}>
        {children}
      </span>
      {long && (
        <button
          type="button"
          className="text-button assistant-detail-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          <Icon name="down" size={14} />
          {tr(expanded ? "assistant_text_less" : "assistant_text_more")}
        </button>
      )}
    </span>
  );
}
export function SnippetLine({
  title,
  detail,
  done,
}: {
  title: string;
  detail?: string;
  done?: boolean;
}) {
  if (!title && !detail) return null;
  return (
    <div className={`assistant-snippet-line ${done ? "is-complete" : ""}`}>
      {done !== undefined && (
        <span className="assistant-snippet-dot" aria-hidden="true">
          {done && <Icon name="check" size={12} />}
        </span>
      )}
      <div className="assistant-snippet-line-content">
        <strong>{title}</strong>
        {detail && <SnippetText>{detail}</SnippetText>}
      </div>
    </div>
  );
}
