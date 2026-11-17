import { useCallback, useRef, useState } from "react";
import type { SettingsPanelProps } from "../../platform/applications/definition";
import { useSettingsDraft } from "../../platform/applications/useSettingsDraft";
import { useApiAction, useApiResource } from "../../platform/useApiResource";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { tr as common } from "../../shared/i18n";
import { taskSettingsApi } from "./api";
import { tr } from "./i18n";
import type { AgendaSettings, ViewSettings, Workspace } from "./types";
import { workspaceTree } from "./workspaceTree";

export function Settings(props: SettingsPanelProps) {
  const spaces = useApiResource(taskSettingsApi.workspaces, []);
  const [workspaceId, setWorkspaceId] = useState("");
  const dirty = useRef(false),
    busy = useRef(false);
  const onDirty = useCallback(
    (value: boolean) => {
      dirty.current = value;
      props.onDirty(value);
    },
    [props.onDirty],
  );
  const onBusy = useCallback(
    (value: boolean) => {
      busy.current = value;
      props.onBusy(value);
    },
    [props.onBusy],
  );
  return (
    <div className="settings-form">
      <h3>{tr("view_preferences")}</h3>
      <p className="muted">{tr("view_preferences_hint")}</p>
      <LoadState {...spaces} />
      {spaces.data && (
        <>
          <label>
            {tr("view_to_configure")}
            <select
              value={workspaceId}
              onChange={(event) => {
                if (busy.current) {
                  window.alert(common("settings_busy"));
                  return;
                }
                if (
                  dirty.current &&
                  !window.confirm(common("progression_unsaved"))
                )
                  return;
                setWorkspaceId(event.target.value);
              }}
            >
              <option value="">{tr("upcoming")}</option>
              {workspaceTree(spaces.data).map(({ space, path }) => (
                <option key={space.id} value={space.id}>
                  {path}
                </option>
              ))}
            </select>
          </label>
          <ViewSettingsPanel
            key={workspaceId}
            workspaceId={workspaceId}
            workspaces={spaces.data}
            onDirty={onDirty}
            onBusy={onBusy}
          />
          {workspaceId && (
            <a
              className="text-button"
              href={`/tasks?space=${workspaceId}&settings=space`}
            >
              {tr("configure_workspace")}
            </a>
          )}
        </>
      )}
    </div>
  );
}
function LoadState({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && <p role="status">{tr("loading")}</p>}
      <ErrorMessage message={error} />
      {error && (
        <button type="button" className="secondary-button" onClick={reload}>
          {tr("try_again")}
        </button>
      )}
    </>
  );
}
function ViewSettingsPanel({
  workspaceId,
  workspaces,
  ...guard
}: SettingsPanelProps & { workspaceId: string; workspaces: Workspace[] }) {
  const resource = useApiResource(
    (signal) => taskSettingsApi.view(workspaceId, signal),
    [workspaceId],
  );
  return (
    <>
      <LoadState {...resource} />
      {resource.data && (
        <PreferencesForm
          initial={resource.data}
          workspaceId={workspaceId}
          workspaces={workspaces}
          {...guard}
        />
      )}
    </>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function PreferencesForm({
  initial,
  workspaceId,
  workspaces,
  ...guard
}: SettingsPanelProps & {
  initial: AgendaSettings | ViewSettings;
  workspaceId: string;
  workspaces: Workspace[];
}) {
  const [value, setValue] = useState(initial),
    [baseline, setBaseline] = useState(initial),
    [saved, setSaved] = useState(false);
  const action = useApiAction();
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
  useSettingsDraft(guard, dirty, action.busy);
  const labelWorkspace =
    "workspace_id" in value ? value.workspace_id : workspaceId;
  const labels = useApiResource(
    (signal) =>
      labelWorkspace
        ? taskSettingsApi.labels(labelWorkspace, signal)
        : Promise.resolve([]),
    [labelWorkspace],
  );
  const statuses = useApiResource(
    (signal) =>
      workspaceId
        ? taskSettingsApi.statuses(workspaceId, signal)
        : Promise.resolve([]),
    [workspaceId],
  );
  function change(patch: Partial<AgendaSettings & ViewSettings>) {
    setValue((v) => ({ ...v, ...patch }));
    setSaved(false);
  }
  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(
          () => taskSettingsApi.saveView(workspaceId, value),
          (result) => {
            setValue(result);
            setBaseline(result);
            setSaved(true);
          },
        );
      }}
    >
      <fieldset disabled={action.busy}>
        {"period" in value ? (
          <>
            <Select
              label={tr("task_period")}
              value={value.period}
              onChange={(period) =>
                change({ period: period as AgendaSettings["period"] })
              }
              options={(["today", "tomorrow", "week", "custom"] as const).map(
                (p) => [p, tr(p)],
              )}
            />
            <label>
              {tr("number_of_days")}
              <input
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={90}
                step={1}
                value={value.custom_days || ""}
                onChange={(e) =>
                  change({ custom_days: Number(e.target.value) })
                }
              />
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={value.include_overdue}
                onChange={(e) => change({ include_overdue: e.target.checked })}
              />
              {tr("include_overdue_tasks")}
            </label>
            <Select
              label={tr("workspace")}
              value={value.workspace_id ?? ""}
              onChange={(id) =>
                change({ workspace_id: id || null, label_id: null })
              }
              options={[
                ["", tr("all_workspaces")],
                ...workspaceTree(workspaces).map(
                  ({ space, path }): [string, string] => [space.id, path],
                ),
              ]}
            />
          </>
        ) : (
          <>
            <Select
              label={tr("task_view")}
              value={value.layout}
              onChange={(layout) =>
                change({ layout: layout as ViewSettings["layout"] })
              }
              options={[
                ["list", tr("list")],
                ["board", tr("board")],
              ]}
            />
            <Select
              label={tr("density")}
              value={value.density}
              onChange={(density) =>
                change({ density: density as ViewSettings["density"] })
              }
              options={[
                ["comfortable", tr("comfortable")],
                ["compact", tr("compact")],
              ]}
            />
            <Select
              label={tr("sort_by")}
              value={value.sort}
              onChange={(sort) =>
                change({ sort: sort as ViewSettings["sort"] })
              }
              options={[
                ["manual", tr("manual_order")],
                ["priority", tr("priority")],
                ["due_date", tr("due_date")],
              ]}
            />
            <Select
              label={tr("due_date")}
              value={value.due}
              onChange={(due) => change({ due: due as ViewSettings["due"] })}
              options={[
                ["all", tr("all_dates")],
                ["overdue", tr("overdue")],
                ["today", tr("today")],
                ["upcoming", tr("upcoming")],
                ["none", tr("no_due_date")],
              ]}
            />
            <LoadState {...statuses} />
            <Select
              label={tr("status")}
              value={value.status_id ?? ""}
              onChange={(id) => change({ status_id: id || null })}
              options={[
                ["", tr("all_statuses")],
                ...(statuses.data ?? []).map((s): [string, string] => [
                  s.id,
                  s.name,
                ]),
              ]}
            />
          </>
        )}
        <label>
          {tr("search_tasks")}
          <input
            maxLength={500}
            value={value.search}
            onChange={(e) => change({ search: e.target.value })}
          />
        </label>
        <Select
          label={tr("priority")}
          value={String(value.priority ?? "")}
          onChange={(priority) =>
            change({ priority: priority ? Number(priority) : null })
          }
          options={[
            ["", tr("all_priorities")],
            ...[1, 2, 3, 4].map((p): [string, string] => [String(p), `P${p}`]),
          ]}
        />
        {labelWorkspace && (
          <>
            <LoadState {...labels} />
            <Select
              label={tr("label")}
              value={value.label_id ?? ""}
              onChange={(id) => change({ label_id: id || null })}
              options={[
                ["", tr("all_labels")],
                ...(labels.data ?? []).map((l): [string, string] => [
                  l.id,
                  l.name,
                ]),
              ]}
            />
          </>
        )}
        <label className="settings-check">
          <input
            type="checkbox"
            checked={value.show_completed}
            onChange={(e) => change({ show_completed: e.target.checked })}
          />
          {tr("show_completed_tasks")}
        </label>
        <ErrorMessage message={action.error} />
        <button className="primary-button" disabled={!dirty || action.busy}>
          {tr("save")}
        </button>
        {saved && <p role="status">{tr("changes_saved")}</p>}
      </fieldset>
    </form>
  );
}
