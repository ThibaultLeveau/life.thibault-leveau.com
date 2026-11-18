import type { ReactNode } from "react";
import { tr } from "../../../shared/i18n";

function inlineText(text: string) {
  return text
    .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") && part.endsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}

/** Split only unescaped pipes, including inside inline code (Markdown tables). */
function tableRow(line: string): string[] | null {
  const cells = [""];
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === "\\" && index + 1 < line.length) {
      const next = line[++index];
      cells[cells.length - 1] += next === "|" ? "|" : character + next;
    } else if (character === "|") {
      cells.push("");
    } else {
      cells[cells.length - 1] += character;
    }
  }
  if (cells.length === 1) return null;
  if (!cells[0].trim()) cells.shift();
  if (!cells.at(-1)?.trim()) cells.pop();
  return cells.length ? cells.map((cell) => cell.trim()) : null;
}

/** A bounded text-only formatter: never interpret model HTML, images or links. */
export function MessageText({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  function flushParagraph() {
    if (paragraph.length) {
      blocks.push(
        <p key={blocks.length}>{inlineText(paragraph.join("\n"))}</p>,
      );
      paragraph = [];
    }
  }

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      flushParagraph();
      const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
      const code: string[] = [];
      index++;
      while (index < lines.length && !closing.test(lines[index])) {
        code.push(lines[index++]);
      }
      // An unfinished fence remains code while the response is streaming.
      if (index < lines.length) index++;
      blocks.push(
        <pre key={blocks.length}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const header = tableRow(line);
    const separators = tableRow(lines[index + 1] ?? "");
    if (
      header &&
      separators?.length === header.length &&
      separators.every((cell) => /^:?-+:?$/.test(cell))
    ) {
      flushParagraph();
      const alignments = separators.map((cell) =>
        cell.endsWith(":")
          ? cell.startsWith(":")
            ? "center"
            : "right"
          : "left",
      );
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        if (/^ {0,3}(`{3,}|~{3,})/.test(lines[index])) break;
        const row = tableRow(lines[index]);
        // Keep malformed rows with surplus cells as text instead of losing data.
        if (!row || row.length > header.length) break;
        rows.push(row);
        index++;
      }
      blocks.push(
        <div
          key={blocks.length}
          className="assistant-message-table"
          role="region"
          aria-label={tr("assistant_table")}
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                {header.map((cell, column) => (
                  <th
                    key={column}
                    scope="col"
                    style={{ textAlign: alignments[column] }}
                  >
                    {inlineText(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {header.map((_, column) => (
                    <td key={column} style={{ textAlign: alignments[column] }}>
                      {inlineText(row[column] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.trim()) paragraph.push(line);
    else flushParagraph();
    index++;
  }
  flushParagraph();
  return <div className="assistant-message-text">{blocks}</div>;
}
