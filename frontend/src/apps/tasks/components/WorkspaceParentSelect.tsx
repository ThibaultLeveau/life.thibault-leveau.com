import type { Workspace } from "../types";
import { workspaceTree } from "../workspaceTree";

export function WorkspaceParentSelect({
  workspaces,
  workspace,
}: {
  workspaces: Workspace[];
  workspace?: Workspace;
}) {
  return (
    <label>
      Espace parent
      <select name="parent_id" defaultValue={workspace?.parent_id ?? ""}>
        <option value="">Aucun — à la racine</option>
        {workspaceTree(workspaces, workspace?.id).map(({ space, path }) => (
          <option key={space.id} value={space.id}>
            {path}
          </option>
        ))}
      </select>
    </label>
  );
}
