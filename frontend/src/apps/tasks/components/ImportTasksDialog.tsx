import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { tr } from "../i18n";
import { useDraftForm } from "../useTaskDrafts";
import { SyncFeedback, useTaskSync } from "../useTaskSync";
import type { Section, TaskImportItem, Workspace } from "../types";

export function ImportTasksDialog({
  workspace,
  sections,
  onClose,
}: {
  workspace: Workspace;
  sections: Section[];
  onClose: () => void;
}) {
  const [source, setSource] = useState("");
  const [format, setFormat] = useState("lines");
  const [sectionId, setSectionId] = useState("");
  const [preview, setPreview] = useState<TaskImportItem[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const sending = useRef(false);
  const draft = useDraftForm();
  const sync = useTaskSync();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function close() {
    if (!sending.current) draft.leave(onClose);
  }
  function review(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const rows: unknown =
        format === "json"
          ? JSON.parse(source)
          : source
              .split(/\r?\n/)
              .map((title) => title.trim())
              .filter(Boolean)
              .map((title) => ({ title }));
      if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100)
        throw new Error(tr("import_count_error"));
      const tasks = rows.map((row): TaskImportItem => {
        if (
          !row ||
          typeof row !== "object" ||
          Array.isArray(row) ||
          typeof row.title !== "string" ||
          !row.title.trim() ||
          Array.from(row.title.trim()).length > 500
        )
          throw new Error(tr("import_title_error"));
        if (row.workspace_id !== undefined && row.workspace_id !== workspace.id)
          throw new Error(tr("import_workspace_error"));
        return {
          section_id: sectionId || null,
          ...row,
          title: row.title.trim(),
          workspace_id: workspace.id,
        };
      });
      setPreview(tasks);
    } catch (failure) {
      setError(
        failure instanceof SyntaxError
          ? tr("import_json_error")
          : (failure as Error).message,
      );
    }
  }
  function submit() {
    if (!preview || sending.current) return;
    sending.current = true;
    setBusy(true);
    sync.mutate(
      "/tasks/import",
      "POST",
      { tasks: preview },
      {
        message: tr("import_success", { count: preview.length }),
        success: () => {
          if (!active.current) return;
          draft.clean();
          onClose();
        },
      },
    );
    void sync.idle().finally(() => {
      sending.current = false;
      if (active.current) setBusy(false);
    });
  }
  return (
    <Dialog title={tr("import_tasks")} onClose={close}>
      <form
        ref={draft.ref}
        className="dialog-body stack-form task-import-form"
        onSubmit={review}
        aria-busy={busy}
      >
        <p>{tr("import_destination", { name: workspace.name })}</p>
        <p className="field-help">{tr("import_help")}</p>
        <label>
          {tr("import_format")}
          <select
            name="format"
            value={format}
            disabled={busy || !!preview}
            onChange={(event) => setFormat(event.target.value)}
          >
            <option value="lines">{tr("import_lines")}</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label>
          {tr("section")}
          <select
            name="section"
            value={sectionId}
            disabled={busy || !!preview}
            onChange={(event) => setSectionId(event.target.value)}
          >
            <option value="">{tr("no_section")}</option>
            {sections
              .filter((section) => !section.archived_at)
              .map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          {tr("import_content")}
          <textarea
            name="source"
            value={source}
            disabled={busy || !!preview}
            rows={9}
            maxLength={200000}
            placeholder={
              format === "json"
                ? '[{"title": "…", "description": "…", "priority": 2}]'
                : tr("import_placeholder")
            }
            onChange={(event) => setSource(event.target.value)}
            required
          />
        </label>
        {format === "json" && (
          <p className="field-help">{tr("import_json_help")}</p>
        )}
        {preview && (
          <section aria-label={tr("import_preview")}>
            <h3>{tr("import_review_count", { count: preview.length })}</h3>
            <ol
              className="task-import-preview"
              tabIndex={0}
              aria-label={tr("import_preview")}
            >
              {preview.map((task, index) => (
                <li key={index}>
                  <strong>{task.title}</strong>
                  {format === "json" && (
                    <pre>{JSON.stringify(task, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ol>
            <p>{tr("import_atomic_help")}</p>
          </section>
        )}
        <ErrorMessage message={error} />
        <SyncFeedback inDialog />
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={close}
          >
            {tr("cancel")}
          </button>
          {preview ? (
            <>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                {tr("import_edit")}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={submit}
              >
                {tr("import_confirm", { count: preview.length })}
              </button>
            </>
          ) : (
            <button className="primary-button" disabled={!source.trim()}>
              {tr("import_preview")}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
