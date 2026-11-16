import { tr } from "../i18n";
import { useTaskSync } from "../useTaskSync";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  type Label,
  type Section,
  type Status,
  type Task,
  type Schedule,
  type ViewSettings,
} from "../types";
import { Icon } from "../../../shared/ui/Icon";
import { TaskContents } from "./TaskContents";
import { useScheduleRecognition } from "../scheduling";
import { ScheduleRecognition } from "./ScheduleRecognition";
import { useTaskActions } from "./TaskActions";

interface Props {
  tasks: Task[];
  today: string;
  sections: Section[];
  statuses: Status[];
  labels: Label[];
  view: ViewSettings;
  busy: boolean;
  onOpen: (task: Task) => void;
  onComplete: (task: Task) => void;
  onAdd: (
    title: string,
    sectionId: string | null,
    statusId: string,
    schedule?: Schedule,
  ) => Promise<void>;
  onConfigure: () => void;
}

function TaskCard({
  task,
  today,
  labels,
  board,
  disabled,
  busy,
  onOpen,
  onComplete,
}: {
  task: Task;
  today: string;
  labels: Label[];
  board: boolean;
  disabled: boolean;
  busy: boolean;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const actions = useTaskActions();
  disabled = disabled || !!actions?.selecting || !!actions?.busy;
  const drag = useDraggable({ id: task.id, data: { task }, disabled });
  const drop = useDroppable({
    id: `before:${task.id}`,
    data: {
      section_id: task.section_id,
      status_id: board ? task.status_id : null,
      before_id: task.id,
    },
    disabled,
  });
  const completed = !!task.completed_at;
  return (
    <article
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={`${board ? "task-card" : "task-row"} ${completed ? "is-completed" : ""} ${drop.isOver ? "drop-before" : ""} ${drag.isDragging ? "is-dragging" : ""}`}
      data-task-id={task.id}
      onPointerDown={(event) => {
        // Touch keeps scrolling/long-press selection; its grip still drags.
        if (
          event.pointerType !== "mouse" ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.target as HTMLElement).closest(
            "button:not(.task-title), input, select, textarea, a",
          )
        )
          return;
        drag.listeners?.onPointerDown?.(event);
      }}
    >
      <button
        className="drag-handle"
        ref={drag.setActivatorNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        disabled={disabled}
        aria-label={tr("drag_task", { name: task.title })}
      >
        <Icon name="grip" size={14} />
      </button>
      <TaskContents
        task={task}
        today={today}
        labels={labels}
        busy={busy}
        onOpen={onOpen}
        onComplete={onComplete}
      />
    </article>
  );
}

function QuickAdd({
  sectionId,
  statusId,
  onAdd,
}: {
  sectionId: string | null;
  statusId: string;
  onAdd: Props["onAdd"];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const recognition = useScheduleRecognition(title, open);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title || busy) return;
    const keepOpen =
      document.activeElement === event.currentTarget.elements.namedItem("title") &&
      window.matchMedia("(min-width: 801px) and (pointer: fine)").matches;
    setBusy(true);
    setError("");
    try {
      const parsed = await recognition.resolve();
      const cleanTitle = parsed?.matched_text ? parsed.title : title;
      if (!cleanTitle.trim())
        throw new Error(tr("add_a_title_next_to_the_date"));
      await onAdd(
        cleanTitle,
        sectionId,
        statusId,
        parsed?.matched_text ? parsed : undefined,
      );
      setTitle("");
      if (!keepOpen) setOpen(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button className="quick-add" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} />
        {tr("add_a_task")}
      </button>
    );
  return (
    <form className="quick-add-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={`quick-${sectionId}-${statusId}`}>
        {tr("task_name")}
      </label>
      <input
        id={`quick-${sectionId}-${statusId}`}
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        readOnly={busy}
        autoFocus
        required
        maxLength={500}
        placeholder={tr("read_tomorrow_run_every_monday")}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <ScheduleRecognition recognition={recognition} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button
          type="button"
          className="text-button"
          onClick={() => setOpen(false)}
        >
          {tr("cancel")}
        </button>
        <button className="primary-button small-button" disabled={busy}>
          {busy ? tr("adding") : tr("add")}
        </button>
      </div>
    </form>
  );
}

function Cell({
  sectionId,
  statusId,
  tasks,
  props,
}: {
  sectionId: string | null;
  statusId: string | null;
  tasks: Task[];
  props: Props;
}) {
  const sync = useTaskSync();
  const disabled = props.busy || props.view.sort !== "manual";
  const drop = useDroppable({
    id: `cell:${sectionId ?? "none"}:${statusId ?? "list"}`,
    data: { section_id: sectionId, status_id: statusId, before_id: null },
    disabled,
  });
  return (
    <div
      ref={drop.setNodeRef}
      className={`${statusId ? "board-cell" : "list-cell"} ${drop.isOver ? "is-drop-target" : ""}`}
      data-drop-section={sectionId ?? "none"}
      data-drop-status={statusId ?? "list"}
    >
      {tasks.map((task) => (
        <TaskCard
          key={sync.keyFor(task.id)}
          task={task}
          today={props.today}
          labels={props.labels}
          board={!!statusId}
          disabled={disabled}
          busy={props.busy}
          onOpen={() => props.onOpen(task)}
          onComplete={() => props.onComplete(task)}
        />
      ))}
      <QuickAdd
        sectionId={sectionId}
        statusId={
          statusId ?? props.statuses.find((status) => !status.is_completed)!.id
        }
        onAdd={props.onAdd}
      />
    </div>
  );
}

export function TaskViews(props: Props) {
  const board = props.view.layout === "board";
  const sections = props.sections.filter(
    (section) =>
      section.visibility === "both" || section.visibility === props.view.layout,
  );
  const groups: {
    id: string | null;
    name: string;
    description: string;
    color: string;
  }[] = [
    { id: null, name: tr("no_section"), description: "", color: "#91948e" },
    ...sections,
  ];
  const grid = {
    gridTemplateColumns: `repeat(${props.statuses.length}, minmax(260px, 1fr))`,
  } as CSSProperties;
  return (
    <div
      className={`${board ? "board-scroll" : "task-lists"} density-${props.view.density}`}
    >
      {board && (
        <div className="board-columns" style={grid}>
          {props.statuses.map((status) => (
            <div key={status.id} className="board-column-title">
              <span
                className="color-dot"
                style={{ background: status.color }}
              />
              <span>{status.name}</span>
              <span className="count-badge">
                {
                  props.tasks.filter(
                    (task) =>
                      task.status_id === status.id &&
                      (!task.section_id ||
                        sections.some(
                          (section) => section.id === task.section_id,
                        )),
                  ).length
                }
              </span>
            </div>
          ))}
        </div>
      )}
      {groups.map((section) => {
        const tasks = props.tasks.filter(
          (task) => task.section_id === section.id,
        );
        return (
          <section
            className={board ? "board-section" : "task-section"}
            key={section.id ?? "none"}
            aria-labelledby={`section-${section.id}`}
          >
            <div className="section-heading">
              <span
                className="section-marker"
                style={{ background: section.color }}
              />
              <h2 id={`section-${section.id}`}>{section.name}</h2>
              <span className="section-count">{tasks.length}</span>
              <span className="spacer" />
              {section.id && (
                <button
                  className="icon-button"
                  aria-label={tr("configure_section", { name: section.name })}
                  onClick={props.onConfigure}
                >
                  <Icon name="more" size={18} />
                </button>
              )}
            </div>
            {section.description && (
              <p className="section-description">{section.description}</p>
            )}
            {board ? (
              <div className="board-row" style={grid}>
                {props.statuses.map((status) => (
                  <Cell
                    key={status.id}
                    sectionId={section.id}
                    statusId={status.id}
                    tasks={tasks.filter(
                      (task) => task.status_id === status.id,
                    )}
                    props={props}
                  />
                ))}
              </div>
            ) : (
              <Cell
                sectionId={section.id}
                statusId={null}
                tasks={tasks}
                props={props}
              />
            )}
          </section>
        );
      })}
      <button className="add-section-button" onClick={props.onConfigure}>
        <Icon name="plus" size={16} />
        {tr("add_a_section")}
      </button>
    </div>
  );
}
