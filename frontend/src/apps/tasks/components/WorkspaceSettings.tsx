import { tr } from "../i18n";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../../platform/api";
import { allTasks } from "../api";
import {
  defaultView,
  type Label,
  type Section,
  type Status,
  type Task,
  type Workspace,
} from "../types";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { WorkspaceParentSelect } from "./WorkspaceParentSelect";
import { Icon } from "../../../shared/ui/Icon";

export type SettingsTab =
  | "space"
  | "sections"
  | "statuses"
  | "labels"
  | "archives";
type Entity = Section | Status | Label;
type Kind = "sections" | "statuses" | "labels";

function EntityForm({
  kind,
  item,
  disabled,
  onSubmit,
  children,
}: {
  kind: Kind;
  item?: Entity;
  disabled: boolean;
  onSubmit: (data: Record<string, unknown>) => Promise<boolean>;
  children?: ReactNode;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload: Record<string, unknown> = Object.fromEntries(data);
    if (kind === "statuses")
      payload.is_completed = data.get("is_completed") === "on";
    if ((await onSubmit(payload)) && !item) form.reset();
  }
  const section =
    kind === "sections" ? (item as Section | undefined) : undefined;
  return (
    <form className="entity-form" onSubmit={submit}>
      <div className="entity-main">
        <label className="entity-color">
          <span className="sr-only">
            {tr("color")} {item?.name ?? tr("of_the_new_item")}
          </span>
          <input
            type="color"
            name="color"
            defaultValue={item?.color ?? "#748b79"}
          />
        </label>
        <label className="entity-name">
          <span className="sr-only">
            {tr("name")} {item?.name ?? tr("of_the_new_item")}
          </span>
          <input
            name="name"
            required
            maxLength={kind === "labels" ? 50 : kind === "statuses" ? 80 : 120}
            defaultValue={item?.name}
            placeholder={
              kind === "sections"
                ? tr("section_name")
                : kind === "statuses"
                  ? tr("column_name")
                  : tr("label_name")
            }
          />
        </label>
        <button
          className={
            item
              ? "secondary-button small-button"
              : "primary-button small-button"
          }
          disabled={disabled}
        >
          {item ? tr("save") : tr("add")}
        </button>
      </div>
      {kind === "sections" && (
        <div className="entity-detail">
          <label>
            {tr("description")}
            <input
              name="description"
              maxLength={20000}
              defaultValue={section?.description}
              placeholder={tr("optional")}
            />
          </label>
          <label>
            {tr("show_in")}
            <select
              name="visibility"
              defaultValue={section?.visibility ?? "both"}
            >
              <option value="both">{tr("list_and_board")}</option>
              <option value="list">{tr("list_only")}</option>
              <option value="board">{tr("board_only")}</option>
            </select>
          </label>
        </div>
      )}
      {kind === "statuses" && (
        <label className="check-label">
          <input
            name="is_completed"
            type="checkbox"
            defaultChecked={item ? (item as Status).is_completed : false}
          />
          {tr("tasks_in_this_column_are_completed")}
        </label>
      )}
      {children && <div className="entity-actions">{children}</div>}
    </form>
  );
}

export function WorkspaceSettings({
  workspace,
  workspaces,
  sections,
  statuses,
  labels,
  initialTab,
  onClose,
  onChanged,
  onArchived,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  sections: Section[];
  statuses: Status[];
  labels: Label[];
  initialTab: SettingsTab;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onArchived: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const base = `/workspaces/${workspace.id}`;
  useEffect(() => {
    if (tab !== "archives") return;
    const controller = new AbortController();
    allTasks(workspace.id, defaultView, true, controller.signal)
      .then((page) => setArchivedTasks(page.items))
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [tab, workspace.id, sections]);
  async function run(path: string, method: string, payload?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, method, payload);
      await onChanged();
      setNotice(tr("changes_saved"));
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function reorder(
    kind: "sections" | "statuses",
    index: number,
    delta: number,
  ) {
    const active =
      kind === "sections"
        ? sections.filter((section) => !section.archived_at)
        : statuses;
    const ids = active.map((item) => item.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    if (kind === "sections")
      ids.push(
        ...sections
          .filter((section) => section.archived_at)
          .map((section) => section.id),
      );
    await run(`${base}/${kind}/order`, "PUT", { ids });
  }
  async function saveSpace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await run(base, "PATCH", {
      ...Object.fromEntries(values),
      parent_id: values.get("parent_id") || null,
    });
  }
  async function archiveSpace() {
    setBusy(true);
    setError("");
    try {
      await api(base, "PATCH", { archived: true });
      onArchived();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const tabs: [SettingsTab, string][] = [
    ["space", tr("workspace")],
    ["sections", tr("sections")],
    ["statuses", tr("columns")],
    ["labels", tr("labels")],
    ["archives", tr("archives")],
  ];
  const entities: Entity[] =
    tab === "sections"
      ? sections.filter((section) => !section.archived_at)
      : tab === "statuses"
        ? statuses
        : labels;
  return (
    <Dialog title={tr("configure_workspace")} onClose={onClose} wide>
      <div
        className="settings-tabs"
        role="tablist"
        aria-label={tr("workspace_settings")}
      >
        {tabs.map(([value, label], index) => (
          <button
            key={value}
            role="tab"
            tabIndex={tab === value ? 0 : -1}
            aria-selected={tab === value}
            aria-controls={`settings-${value}`}
            id={`tab-${value}`}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setTab(tabs[next][0]);
                document.getElementById(`tab-${tabs[next][0]}`)?.focus();
                setError("");
                setNotice("");
              }
            }}
            onClick={() => {
              setTab(value);
              setError("");
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="dialog-body settings-body"
        role="tabpanel"
        id={`settings-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "space" && (
          <>
            <form className="stack-form" onSubmit={saveSpace}>
              <label>
                {tr("name")}
                <input
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={workspace.name}
                />
              </label>
              <WorkspaceParentSelect
                workspaces={workspaces}
                workspace={workspace}
              />
              <label>
                {tr("description")}
                <textarea
                  name="description"
                  rows={3}
                  maxLength={20000}
                  defaultValue={workspace.description}
                />
              </label>
              <label className="color-field">
                {tr("color")}
                <input
                  type="color"
                  name="color"
                  defaultValue={workspace.color}
                />
              </label>
              <div className="dialog-actions">
                <button className="primary-button" disabled={busy}>
                  {tr("save")}
                </button>
              </div>
            </form>
            <div className="archive-space">
              <div>
                <strong>{tr("archive_this_workspace")}</strong>
                <p className="muted small-text">
                  {tr("you_can_restore_it_from_the_archives_tasks_and_their")}
                </p>
              </div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={archiveSpace}
              >
                <Icon name="archive" />
                {tr("archive")}
              </button>
            </div>
          </>
        )}
        {(tab === "sections" || tab === "statuses" || tab === "labels") && (
          <>
            <p className="settings-explanation muted">
              {tab === "sections"
                ? tr(
                    "sections_form_your_lists_and_board_rows_choose_where_each",
                  )
                : tab === "statuses"
                  ? tr(
                      "statuses_become_board_columns_keep_at_least_one_open_column",
                    )
                  : tr(
                      "find_your_tasks_using_labels_specific_to_this_workspace",
                    )}
            </p>
            <div className="entity-list">
              {entities.map((item, index) => (
                <EntityForm
                  key={item.id}
                  kind={tab}
                  item={item}
                  disabled={busy}
                  onSubmit={(payload) =>
                    run(
                      `${base}/${tab}/${item.id}`,
                      tab === "labels" ? "PUT" : "PATCH",
                      payload,
                    )
                  }
                >
                  {tab !== "labels" && (
                    <>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={busy || index === 0}
                        aria-label={tr("move_up", { name: item.name })}
                        onClick={() => reorder(tab, index, -1)}
                      >
                        <Icon name="up" size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={busy || index === entities.length - 1}
                        aria-label={tr("move_down", { name: item.name })}
                        onClick={() => reorder(tab, index, 1)}
                      >
                        <Icon name="down" size={16} />
                      </button>
                    </>
                  )}
                  <span className="spacer" />
                  {tab === "sections" && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        run(`${base}/sections/${item.id}`, "PATCH", {
                          archived: true,
                        })
                      }
                    >
                      <Icon name="archive" size={14} />
                      {tr("archive")}
                    </button>
                  )}
                  {tab === "labels" && (
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            tr("delete_label_confirmation", {
                              name: item.name,
                            }),
                          )
                        )
                          void run(`${base}/labels/${item.id}`, "DELETE");
                      }}
                    >
                      {tr("delete")}
                    </button>
                  )}
                  {tab === "statuses" && (
                    <>
                      <label className="replacement-label">
                        <span className="sr-only">
                          {tr("replace")} {item.name} {tr("with")}
                        </span>
                        <select
                          value={replacements[item.id] ?? ""}
                          onChange={(event) =>
                            setReplacements((previous) => ({
                              ...previous,
                              [item.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">{tr("replace_with")}</option>
                          {statuses
                            .filter(
                              (status) =>
                                status.id !== item.id &&
                                status.is_completed ===
                                  (item as Status).is_completed,
                            )
                            .map((status) => (
                              <option key={status.id} value={status.id}>
                                {status.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              tr("remove_column_confirmation", {
                                name: item.name,
                              }),
                            )
                          )
                            void run(
                              `${base}/statuses/${item.id}${replacements[item.id] ? `?replacement_id=${replacements[item.id]}` : ""}`,
                              "DELETE",
                            );
                        }}
                      >
                        {tr("remove")}
                      </button>
                    </>
                  )}
                </EntityForm>
              ))}
            </div>
            <h3 className="settings-add-title">
              {tab === "sections"
                ? tr("new_section")
                : tab === "statuses"
                  ? tr("new_column")
                  : tr("new_label")}
            </h3>
            <EntityForm
              key={tab}
              kind={tab}
              disabled={busy}
              onSubmit={(payload) => run(`${base}/${tab}`, "POST", payload)}
            />
          </>
        )}
        {tab === "archives" && (
          <>
            <h3>{tr("archived_sections")}</h3>
            {sections.filter((section) => section.archived_at).length === 0 && (
              <p className="muted">{tr("no_archived_sections")}</p>
            )}
            {sections
              .filter((section) => section.archived_at)
              .map((section) => (
                <div className="archive-row" key={section.id}>
                  <span>{section.name}</span>
                  <button
                    className="secondary-button small-button"
                    disabled={busy}
                    onClick={() =>
                      run(`${base}/sections/${section.id}`, "PATCH", {
                        archived: false,
                      })
                    }
                  >
                    <Icon name="restore" size={14} />
                    {tr("restore")}
                  </button>
                </div>
              ))}
            <h3>{tr("archived_tasks")}</h3>
            {archivedTasks.length === 0 && (
              <p className="muted">{tr("no_archived_tasks")}</p>
            )}
            {archivedTasks.map((task) => {
              const parentArchived = sections.some(
                (section) =>
                  section.id === task.section_id && section.archived_at,
              );
              return (
                <div className="archive-row" key={task.id}>
                  <div>
                    <span>{task.title}</span>
                    {parentArchived && (
                      <small className="muted">
                        {tr("restore_its_section_first")}
                      </small>
                    )}
                  </div>
                  {task.archived_at && (
                    <button
                      className="secondary-button small-button"
                      disabled={busy || parentArchived}
                      onClick={async () => {
                        if (
                          await run(`/tasks/${task.id}`, "PATCH", {
                            expected_version: task.version,
                            archived: false,
                          })
                        )
                          setArchivedTasks((previous) =>
                            previous.filter((item) => item.id !== task.id),
                          );
                      }}
                    >
                      <Icon name="restore" size={14} />
                      {tr("restore")}
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
        <ErrorMessage message={error} />
        {notice && (
          <p className="success-message" role="status">
            {notice}
          </p>
        )}
      </div>
    </Dialog>
  );
}
