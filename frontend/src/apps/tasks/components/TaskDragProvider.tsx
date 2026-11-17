import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import { tr } from "../i18n";
import { useTaskSync } from "../useTaskSync";
import type { Task } from "../types";

export type Destination =
  | {
      section_id: string | null;
      status_id: string | null;
      before_id: string | null;
    }
  | { workspace_id: string };

const collision: CollisionDetection = (args) => {
  // Pointer drops must hit an actual target; keyboard movement uses proximity.
  const candidates = {
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) => container.id !== `before:${args.active.id}`,
    ),
  };
  if (!args.pointerCoordinates) return closestCenter(candidates);
  const hits = pointerWithin(candidates);
  const cards = hits.filter((hit) => String(hit.id).startsWith("before:"));
  return cards.length ? cards : hits;
};

export function TaskDragProvider({
  children,
  disabled,
  onMove,
}: {
  children: ReactNode;
  disabled: boolean;
  onMove: (task: Task, destination: Destination) => void;
}) {
  const { data } = useTaskSync();
  const [reduce, setReduce] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduce(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  function destination(value?: Record<string, unknown>) {
    if (!value) return tr("drag_no_destination");
    if (value.workspace_id)
      return (
        data?.workspaces.find((space) => space.id === value.workspace_id)
          ?.name ?? tr("workspace")
      );
    if (value.before_id)
      return tr("before_task", {
        title:
          data?.tasks.find((task) => task.id === value.before_id)?.title ?? "",
      });
    return [
      data?.sections.find((section) => section.id === value.section_id)?.name ??
        tr("no_section"),
      data?.statuses.find((status) => status.id === value.status_id)?.name,
    ]
      .filter(Boolean)
      .join(" / ");
  }
  const [dragged, setDragged] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(event) =>
        setDragged(event.active.data.current?.task ?? null)
      }
      onDragCancel={() => setDragged(null)}
      onDragEnd={(event) => {
        setDragged(null);
        const task = event.active.data.current?.task as Task | undefined;
        const destination = event.over?.data.current as Destination | undefined;
        if (disabled || !task || !destination) return;
        if ("before_id" in destination && destination.before_id === task.id)
          return;
        onMove(task, destination);
      }}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            tr("drag_picked_up", { title: active.data.current?.task.title }),
          onDragOver: ({ active, over }) =>
            tr("drag_over", {
              title: active.data.current?.task.title,
              destination: destination(over?.data.current),
            }),
          onDragEnd: ({ active, over }) =>
            tr(over ? "drag_dropped" : "drag_cancelled", {
              title: active.data.current?.task.title,
              destination: destination(over?.data.current),
            }),
          onDragCancel: ({ active }) =>
            tr("drag_cancelled", { title: active.data.current?.task.title }),
        },
        screenReaderInstructions: {
          draggable: tr("press_space_to_pick_up_a_task_use_the_arrow"),
        },
      }}
    >
      <div className="ui-scope tasks-shell">
        {children}
        <DragOverlay
          dropAnimation={reduce ? null : { duration: 180, easing: "ease-out" }}
          style={{ pointerEvents: "none" }}
        >
          {dragged && (
            <div className="task-card drag-overlay">
              <span className={`task-checkbox priority-${dragged.priority}`} />
              <span>{dragged.title}</span>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}

export function WorkspaceDropLink({
  workspaceId,
  className,
  ...props
}: ComponentProps<"button"> & { workspaceId: string }) {
  const { active } = useDndContext();
  const task = active?.data.current?.task as Task | undefined;
  const drop = useDroppable({
    id: `workspace:${workspaceId}`,
    data: { workspace_id: workspaceId },
    disabled: !task || task.workspace_id === workspaceId,
  });
  return (
    <button
      {...props}
      ref={drop.setNodeRef}
      className={`${className} ${drop.isOver ? "is-drop-target" : ""}`}
    />
  );
}
