import { useLayoutEffect, useRef, type RefObject } from "react";

/** Keep rows and keyboard focus continuous through completion, moves and rollback. */
export function useTaskMotion(
  root: RefObject<HTMLDivElement | null>,
  revision: string,
) {
  const previous = useRef(new Map<string, { left: number; top: number }>());
  const focused = useRef<string | null>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const rows = [...element.querySelectorAll<HTMLElement>("[data-task-id]")];
    const origin = element.getBoundingClientRect();
    const next = new Map(
      rows.map((row) => {
        const rect = row.getBoundingClientRect();
        return [
          row.dataset.taskId!,
          { left: rect.left - origin.left, top: rect.top - origin.top },
        ];
      }),
    );
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce)
      for (const row of rows) {
        const before = previous.current.get(row.dataset.taskId!);
        const after = next.get(row.dataset.taskId!)!;
        if (before && !row.classList.contains("is-dragging")) {
          const x = before.left - after.left,
            y = before.top - after.top;
          if (Math.abs(x) + Math.abs(y) > 1 && Math.abs(y) < innerHeight)
            row.animate(
              [
                { transform: `translate(${x}px, ${y}px)` },
                { transform: "translate(0, 0)" },
              ],
              { duration: 180, easing: "ease-out" },
            );
        }
      }
    if (
      focused.current &&
      previous.current.has(focused.current) &&
      !next.has(focused.current) &&
      document.activeElement === document.body
    ) {
      const index = [...previous.current.keys()].indexOf(focused.current);
      const target = rows[Math.min(index, rows.length - 1)];
      (
        target?.querySelector<HTMLElement>(
          ".task-checkbox:not(:disabled), .task-title",
        ) ?? document.querySelector<HTMLElement>("main[tabindex]")
      )?.focus({ preventScroll: true });
    }
    previous.current = next;
  }, [revision]);
  return (target: EventTarget) => {
    focused.current =
      (target as HTMLElement).closest<HTMLElement>("[data-task-id]")?.dataset
        .taskId ?? null;
    // Paging is owned by each group; capture newly rendered rows on focus too.
    if (
      focused.current &&
      !previous.current.has(focused.current) &&
      root.current
    ) {
      const origin = root.current.getBoundingClientRect();
      previous.current = new Map(
        [...root.current.querySelectorAll<HTMLElement>("[data-task-id]")].map(
          (row) => {
            const rect = row.getBoundingClientRect();
            return [
              row.dataset.taskId!,
              { left: rect.left - origin.left, top: rect.top - origin.top },
            ];
          },
        ),
      );
    }
  };
}
