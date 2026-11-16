import { tr } from "../i18n";
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
      {tr("parent_workspace")}
      <select name="parent_id" defaultValue={workspace?.parent_id ?? ""}>
        <option value="">{tr("none_at_the_root")}</option>
        {workspaceTree(workspaces, workspace?.id).map(({ space, path }) => (
          <option key={space.id} value={space.id}>
            {path}
          </option>
        ))}
      </select>
    </label>
  );
}
