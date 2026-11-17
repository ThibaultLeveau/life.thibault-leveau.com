import type { ReactNode } from "react";
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
export function SnippetLine({
  title,
  detail,
  done = false,
}: {
  title: string;
  detail?: string;
  done?: boolean;
}) {
  if (!title && !detail) return null;
  return (
    <div className={`assistant-snippet-line ${done ? "is-complete" : ""}`}>
      <span className="assistant-snippet-dot">
        {done && <Icon name="check" size={12} />}
      </span>
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </div>
  );
}
