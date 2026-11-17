import { tr } from "../i18n";
import { useDraftForm } from "../useTaskDrafts";
import { useState, type FormEvent } from "react";
import { useTaskSync } from "../useTaskSync";
import type { Workspace } from "../types";
import { WorkspaceParentSelect } from "./WorkspaceParentSelect";
import { Dialog } from "../../../shared/ui/Dialog";
import { ColorPicker } from "./ColorPicker";

export function WorkspaceDialog({
  workspaces,
  onClose,
  onCreated,
}: {
  workspaces: Workspace[];
  onClose: () => void;
  onCreated: (workspace: Workspace) => void;
}) {
  const sync = useTaskSync();
  const [color, setColor] = useState("#c05a45");
  const draft = useDraftForm(color);
  const close = () => draft.leave(onClose);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    sync.mutate(
      "/workspaces",
      "POST",
      {
        ...Object.fromEntries(values),
        parent_id: values.get("parent_id") || null,
      },
      {
        message: tr("changes_saved"),
        success: (result) => onCreated(result as Workspace),
      },
    );
    onClose();
  }

  return (
    <Dialog title={tr("create_a_workspace")} onClose={close}>
      <form
        ref={draft.ref}
        className="stack-form dialog-body"
        onSubmit={submit}
      >
        <p className="muted">
          {tr("a_workspace_for_your_projects_daily_life_or_whatever_matters")}
        </p>
        <label>
          {tr("workspace_name")}
          <input
            name="name"
            autoFocus
            required
            maxLength={120}
            placeholder={tr("personal_work_a_new_project")}
          />
        </label>
        <WorkspaceParentSelect workspaces={workspaces} />
        <label>
          {tr("description")}
          <textarea
            name="description"
            rows={3}
            maxLength={20000}
            placeholder={tr("what_is_this_workspace_for")}
          />
        </label>
        <ColorPicker value={color} onChange={setColor} />
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={close}>
            {tr("cancel")}
          </button>
          <button className="primary-button">{tr("create_workspace")}</button>
        </div>
      </form>
    </Dialog>
  );
}
