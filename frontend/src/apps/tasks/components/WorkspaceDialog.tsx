import { tr } from "../i18n";
import { useState, type FormEvent } from "react";
import { api } from "../../../platform/api";
import type { Workspace } from "../types";
import { WorkspaceParentSelect } from "./WorkspaceParentSelect";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";

export function WorkspaceDialog({
  workspaces,
  onClose,
  onCreated,
}: {
  workspaces: Workspace[];
  onClose: () => void;
  onCreated: (workspace: Workspace) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      onCreated(
        await api<Workspace>("/workspaces", "POST", {
          ...Object.fromEntries(values),
          parent_id: values.get("parent_id") || null,
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={tr("create_a_workspace")} onClose={onClose}>
      <form className="stack-form dialog-body" onSubmit={submit}>
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
        <label className="color-field">
          {tr("color")}
          <input name="color" type="color" defaultValue="#c05a45" />
        </label>
        <ErrorMessage message={error} />
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            {tr("cancel")}
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? tr("creating") : tr("create_workspace")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
