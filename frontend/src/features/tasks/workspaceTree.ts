import type { Workspace } from "./types";

// Each sibling group follows the global order returned by the API.
export function workspaceTree(spaces: Workspace[], excludedId?: string) {
  const ids = new Set(spaces.map((space) => space.id));
  const children = new Map<string | null, Workspace[]>();
  for (const space of [...spaces].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  )) {
    const parent =
      space.parent_id && ids.has(space.parent_id) ? space.parent_id : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(space);
    children.set(parent, siblings);
  }
  const pending = (children.get(null) ?? [])
    .map((space) => ({
      space,
      depth: 0,
      path: space.name,
    }))
    .reverse();
  const result: typeof pending = [];
  while (pending.length) {
    const row = pending.pop()!;
    if (row.space.id === excludedId) continue;
    result.push(row);
    for (const space of [...(children.get(row.space.id) ?? [])].reverse()) {
      pending.push({
        space,
        depth: row.depth + 1,
        path: `${row.path} / ${space.name}`,
      });
    }
  }
  return result;
}
