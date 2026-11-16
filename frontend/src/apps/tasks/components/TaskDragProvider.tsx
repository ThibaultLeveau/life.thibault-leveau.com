import { useState, type ComponentProps, type ReactNode } from "react";
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
        screenReaderInstructions: {
          draggable: tr("press_space_to_pick_up_a_task_use_the_arrow"),
        },
      }}
    >
      <div className="ui-scope tasks-shell">
        {children}
        <DragOverlay>
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
