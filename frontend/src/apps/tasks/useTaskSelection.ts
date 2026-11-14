import { useEffect, useRef, useState, type RefObject } from "react";

type Box = { left: number; top: number; width: number; height: number };
export function useTaskSelection(
  surface: RefObject<HTMLDivElement | null>,
  disabled: boolean,
  selected: Set<string>,
  onSelect: (ids: Set<string>) => void,
) {
  const [box, setBox] = useState<Box | null>(null);
  const suppressClick = useRef(0);
  const latest = useRef({ selected, onSelect });
  latest.current = { selected, onSelect };
  useEffect(() => {
    const root = surface.current;
    if (!root || disabled) return;
    const scroller = root.closest<HTMLElement>(".tasks-main")!;
    let gesture: {
      id: number;
      x: number;
      y: number;
      endX: number;
      endY: number;
      scrollY: number;
      scrollX: number;
      board: HTMLElement | null;
      touch: boolean;
      active: boolean;
      base: Set<string>;
      previous: Set<string>;
    } | null = null;
    let timer = 0;
    let frame = 0;
    function stop(cancel = false) {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      const previousGesture = gesture;
      gesture = null;
      if (previousGesture?.active) {
        suppressClick.current = performance.now() + 700;
        if (cancel) latest.current.onSelect(previousGesture.previous);
      }
      if (previousGesture && root?.hasPointerCapture(previousGesture.id))
        root.releasePointerCapture(previousGesture.id);
      setBox(null);
    }
    function draw() {
      const g = gesture;
      if (!g || !g.active || g.touch) return;
      const speed = (position: number, min: number, max: number) =>
        position < min + 40
          ? -Math.min(18, (min + 40 - position) / 3)
          : position > max - 40
            ? Math.min(18, (position - max + 40) / 3)
            : 0;
      const scrollBounds = scroller.getBoundingClientRect();
      scroller.scrollTop += speed(
        g.endY,
        scrollBounds.top,
        Math.min(scrollBounds.bottom, innerHeight),
      );
      if (g.board) {
        const bounds = g.board.getBoundingClientRect();
        g.board.scrollLeft += speed(
          g.endX,
          bounds.left,
          Math.min(bounds.right, innerWidth),
        );
      }
      const x = g.x + g.scrollX - (g.board?.scrollLeft ?? 0);
      const y = g.y + g.scrollY - scroller.scrollTop;
      const left = Math.min(x, g.endX);
      const top = Math.min(y, g.endY);
      const right = Math.max(x, g.endX);
      const bottom = Math.max(y, g.endY);
      setBox({
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: Math.max(0, Math.min(innerWidth, right) - Math.max(0, left)),
        height: Math.max(0, Math.min(innerHeight, bottom) - Math.max(0, top)),
      });
      const ids = new Set(g.base);
      for (const card of root!.querySelectorAll<HTMLElement>(
        "[data-task-id]",
      )) {
        const rect = card.getBoundingClientRect();
        if (
          rect.width &&
          rect.height &&
          rect.left < right &&
          rect.right > left &&
          rect.top < bottom &&
          rect.bottom > top
        )
          ids.add(card.dataset.taskId!);
      }
      const current = latest.current.selected;
      if (
        ids.size !== current.size ||
        [...ids].some((id) => !current.has(id))
      )
        latest.current.onSelect(ids);
      frame = requestAnimationFrame(draw);
    }
    function down(event: PointerEvent) {
      if (gesture) {
        stop(true);
        return;
      }
      suppressClick.current = 0;
      if (!event.isPrimary || event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "button:not(.task-title), input, select, textarea, a, [role=dialog], [data-selection-toolbar]",
        )
      )
        return;
      const card = target.closest<HTMLElement>("[data-task-id]");
      const touch = event.pointerType !== "mouse";
      if (touch && !card) return;
      const board = target.closest<HTMLElement>(".board-scroll");
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        endX: event.clientX,
        endY: event.clientY,
        scrollY: scroller.scrollTop,
        scrollX: board?.scrollLeft ?? 0,
        board,
        touch,
        active: false,
        base:
          event.ctrlKey || event.metaKey || event.shiftKey
            ? new Set(latest.current.selected)
            : new Set(),
        previous: latest.current.selected,
      };
      if (touch)
        timer = window.setTimeout(() => {
          if (!gesture || !card) return;
          gesture.active = true;
          latest.current.onSelect(
            new Set([...latest.current.selected, card.dataset.taskId!]),
          );
          suppressClick.current = performance.now() + 700;
        }, 450);
    }
    function move(event: PointerEvent) {
      const g = gesture;
      if (!g || event.pointerId !== g.id) return;
      const distance = Math.hypot(event.clientX - g.x, event.clientY - g.y);
      if (g.touch) {
        if (!g.active && distance > 10) stop();
        else if (g.active) event.preventDefault();
        return;
      }
      g.endX = Math.max(0, Math.min(innerWidth, event.clientX));
      g.endY = Math.max(0, Math.min(innerHeight, event.clientY));
      if (!g.active && distance >= 6) {
        g.active = true;
        root!.setPointerCapture(event.pointerId);
        window.getSelection()?.removeAllRanges();
        frame = requestAnimationFrame(draw);
      }
      if (g.active) event.preventDefault();
    }
    function up(event: PointerEvent) {
      if (gesture?.id === event.pointerId)
        stop(event.type === "pointercancel" && !gesture.touch);
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && gesture) {
        event.preventDefault();
        stop(true);
      }
    }
    const blur = () => stop(true);
    const scroll = () => {
      if (gesture?.touch && !gesture.active) stop();
    };
    const touchmove = (event: TouchEvent) => {
      if (gesture?.touch && gesture.active) event.preventDefault();
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("lostpointercapture", blur);
    root.addEventListener("touchmove", touchmove, { passive: false });
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    window.addEventListener("scroll", scroll, true);
    return () => {
      stop();
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("lostpointercapture", blur);
      root.removeEventListener("touchmove", touchmove);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [surface, disabled]);
  return { box, suppressClick };
}
