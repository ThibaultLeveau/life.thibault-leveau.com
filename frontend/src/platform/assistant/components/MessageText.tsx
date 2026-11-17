import { Fragment } from "react";
/** A small text-only formatter: no model HTML, remote images, or executable links. */
export function MessageText({ content }: { content: string }) {
  const blocks = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="assistant-message-text">
      {blocks.map((block, index) =>
        block.startsWith("```") ? (
          <pre key={index}>
            <code>
              {block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}
            </code>
          </pre>
        ) : (
          <Fragment key={index}>
            {block.split(/\n\n+/).map((paragraph, i) => (
              <p key={i}>
                {paragraph
                  .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)
                  .map((part, j) =>
                    part.startsWith("**") && part.endsWith("**") ? (
                      <strong key={j}>{part.slice(2, -2)}</strong>
                    ) : part.startsWith("`") && part.endsWith("`") ? (
                      <code key={j}>{part.slice(1, -1)}</code>
                    ) : (
                      part
                    ),
                  )}
              </p>
            ))}
          </Fragment>
        ),
      )}
    </div>
  );
}
