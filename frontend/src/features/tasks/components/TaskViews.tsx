import { useState, type CSSProperties, type FormEvent } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  type Label,
  type Section,
  type Status,
  type Task,
  type Schedule,
  type ViewSettings,
} from "../types";
import { Icon } from "./Icon";
import { TaskContents } from "./TaskContents";
import { useScheduleRecognition } from "../scheduling";
import { ScheduleRecognition } from "./ScheduleRecognition";
import { useTaskActions } from "./TaskActions";

export interface Destination {
  section_id: string | null;
  status_id: string | null;
  before_id: string | null;
}
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
  onMove: (task: Task, destination: Destination) => Promise<void>;
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
    >
      <button
        className="drag-handle"
        ref={drag.setActivatorNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        disabled={disabled}
        aria-label={`Glisser la tâche ${task.title}`}
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
    const form = event.currentTarget;
    if (!title) return;
    setBusy(true);
    setError("");
    try {
      const parsed = await recognition.resolve();
      const cleanTitle = parsed?.matched_text ? parsed.title : title;
      if (!cleanTitle.trim())
        throw new Error("Ajoutez un titre à côté de la date.");
      await onAdd(
        cleanTitle,
        sectionId,
        statusId,
        parsed?.matched_text ? parsed : undefined,
      );
      form.reset();
      setTitle("");
      setOpen(false);
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
        Ajouter une tâche
      </button>
    );
  return (
    <form className="quick-add-form" onSubmit={submit}>
      <label className="sr-only" htmlFor={`quick-${sectionId}-${statusId}`}>
        Nom de la tâche
      </label>
      <input
        id={`quick-${sectionId}-${statusId}`}
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={busy}
        autoFocus
        required
        maxLength={500}
        placeholder="Lire demain, courir tous les lundis…"
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
          Annuler
        </button>
        <button className="primary-button small-button" disabled={busy}>
          {busy ? "Ajout…" : "Ajouter"}
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
          key={task.id}
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
          statusId ??
          props.statuses.find((status) => !status.is_completed)!.id
        }
        onAdd={props.onAdd}
      />
    </div>
  );
}

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const cards = hits.filter((hit) => String(hit.id).startsWith("before:"));
  return cards.length ? cards : hits.length ? hits : closestCenter(args);
};

export function TaskViews(props: Props) {
  const [dragged, setDragged] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const board = props.view.layout === "board";
  const sections = props.sections.filter(
    (section) =>
      section.visibility === "both" ||
      section.visibility === props.view.layout,
  );
  const groups: {
    id: string | null;
    name: string;
    description: string;
    color: string;
  }[] = [
    { id: null, name: "Sans section", description: "", color: "#91948e" },
    ...sections,
  ];
  async function end(event: DragEndEvent) {
    const task = dragged;
    setDragged(null);
    if (!task || !event.over || props.view.sort !== "manual") return;
    const target = event.over.data.current as Destination;
    if (target.before_id === task.id) return;
    await props.onMove(task, target);
  }
  const grid = {
    gridTemplateColumns: `repeat(${props.statuses.length}, minmax(260px, 1fr))`,
  } as CSSProperties;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(event) =>
        setDragged(event.active.data.current?.task ?? null)
      }
      onDragCancel={() => setDragged(null)}
      onDragEnd={end}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Appuyez sur Espace pour saisir une tâche, utilisez les flèches puis Espace pour la déposer. Échap annule. Le titre ouvre aussi les détails et la commande Déplacer.",
        },
      }}
    >
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
                    aria-label={`Configurer la section ${section.name}`}
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
          Ajouter une section
        </button>
      </div>
      <DragOverlay>
        {dragged && (
          <div className="task-card drag-overlay">
            <span className={`task-checkbox priority-${dragged.priority}`} />
            <span>{dragged.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
