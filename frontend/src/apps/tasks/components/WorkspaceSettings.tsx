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
            Couleur {item?.name ?? "du nouvel élément"}
          </span>
          <input
            type="color"
            name="color"
            defaultValue={item?.color ?? "#748b79"}
          />
        </label>
        <label className="entity-name">
          <span className="sr-only">
            Nom {item?.name ?? "du nouvel élément"}
          </span>
          <input
            name="name"
            required
            maxLength={kind === "labels" ? 50 : kind === "statuses" ? 80 : 120}
            defaultValue={item?.name}
            placeholder={
              kind === "sections"
                ? "Nom de la section"
                : kind === "statuses"
                  ? "Nom de la colonne"
                  : "Nom de l’étiquette"
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
          {item ? "Enregistrer" : "Ajouter"}
        </button>
      </div>
      {kind === "sections" && (
        <div className="entity-detail">
          <label>
            Description
            <input
              name="description"
              maxLength={20000}
              defaultValue={section?.description}
              placeholder="Facultative"
            />
          </label>
          <label>
            Afficher dans
            <select
              name="visibility"
              defaultValue={section?.visibility ?? "both"}
            >
              <option value="both">Liste et tableau</option>
              <option value="list">Liste uniquement</option>
              <option value="board">Tableau uniquement</option>
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
          Les tâches de cette colonne sont terminées
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
      setNotice("Modifications enregistrées.");
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
    ["space", "Espace"],
    ["sections", "Sections"],
    ["statuses", "Colonnes"],
    ["labels", "Étiquettes"],
    ["archives", "Archives"],
  ];
  const entities: Entity[] =
    tab === "sections"
      ? sections.filter((section) => !section.archived_at)
      : tab === "statuses"
        ? statuses
        : labels;
  return (
    <Dialog title="Configurer l’espace" onClose={onClose} wide>
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Réglages de l’espace"
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
                Nom
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
                Description
                <textarea
                  name="description"
                  rows={3}
                  maxLength={20000}
                  defaultValue={workspace.description}
                />
              </label>
              <label className="color-field">
                Couleur
                <input
                  type="color"
                  name="color"
                  defaultValue={workspace.color}
                />
              </label>
              <div className="dialog-actions">
                <button className="primary-button" disabled={busy}>
                  Enregistrer
                </button>
              </div>
            </form>
            <div className="archive-space">
              <div>
                <strong>Archiver cet espace</strong>
                <p className="muted small-text">
                  Vous pourrez le restaurer depuis les archives. Les tâches et
                  leur historique sont conservés. Archivez ou déplacez d’abord
                  les sous-espaces actifs.
                </p>
              </div>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={archiveSpace}
              >
                <Icon name="archive" />
                Archiver
              </button>
            </div>
          </>
        )}
        {(tab === "sections" || tab === "statuses" || tab === "labels") && (
          <>
            <p className="settings-explanation muted">
              {tab === "sections"
                ? "Les sections forment vos listes et les lignes du tableau. Choisissez où chacune apparaît."
                : tab === "statuses"
                  ? "Les statuts deviennent les colonnes du tableau. Conservez au moins une colonne ouverte et une terminée."
                  : "Retrouvez vos tâches grâce à des étiquettes propres à cet espace."}
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
                        aria-label={`Monter ${item.name}`}
                        onClick={() => reorder(tab, index, -1)}
                      >
                        <Icon name="up" size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={busy || index === entities.length - 1}
                        aria-label={`Descendre ${item.name}`}
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
                      Archiver
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
                            `Supprimer l’étiquette « ${item.name} » de toutes les tâches ?`,
                          )
                        )
                          void run(`${base}/labels/${item.id}`, "DELETE");
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                  {tab === "statuses" && (
                    <>
                      <label className="replacement-label">
                        <span className="sr-only">
                          Remplacer {item.name} par
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
                          <option value="">Remplacer par…</option>
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
                              `Retirer la colonne « ${item.name} » ? Ses tâches seront réaffectées au statut choisi.`,
                            )
                          )
                            void run(
                              `${base}/statuses/${item.id}${replacements[item.id] ? `?replacement_id=${replacements[item.id]}` : ""}`,
                              "DELETE",
                            );
                        }}
                      >
                        Retirer
                      </button>
                    </>
                  )}
                </EntityForm>
              ))}
            </div>
            <h3 className="settings-add-title">
              {tab === "sections"
                ? "Nouvelle section"
                : tab === "statuses"
                  ? "Nouvelle colonne"
                  : "Nouvelle étiquette"}
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
            <h3>Sections archivées</h3>
            {sections.filter((section) => section.archived_at).length === 0 && (
              <p className="muted">Aucune section archivée.</p>
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
                    Restaurer
                  </button>
                </div>
              ))}
            <h3>Tâches archivées</h3>
            {archivedTasks.length === 0 && (
              <p className="muted">Aucune tâche archivée.</p>
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
                        Restaurez d’abord sa section.
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
                      Restaurer
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
