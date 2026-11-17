import { useEffect, useRef, useState } from "react";
import { useTaskDrafts } from "./useTaskDrafts";
export type TaskLocation =
  | "agenda"
  | "space"
  | "search"
  | "all"
  | "undated"
  | "archives";
function read() {
  const params = new URLSearchParams(location.search);
  const view = params.get("view");
  return {
    view: (params.has("space")
      ? "space"
      : ["search", "all", "undated", "archives"].includes(view ?? "")
        ? view
        : "agenda") as TaskLocation,
    space: params.get("space") ?? "",
    key: location.search,
    fromHistory: false,
    index: Number(history.state?.tasksIndex ?? 0),
  };
}
export function useTaskNavigation() {
  const drafts = useTaskDrafts();
  const [route, setRoute] = useState(read);
  const index = useRef(0);
  const returning = useRef(false);
  const positions = useRef(new Map<number, number>());
  const current = useRef(route);
  current.current = route;
  const saveScroll = () =>
    positions.current.set(
      current.current.index,
      document.getElementById("tasks-content")?.scrollTop ?? 0,
    );
  useEffect(() => {
    index.current = history.state?.tasksIndex ?? 0;
    history.replaceState({ ...history.state, tasksIndex: index.current }, "");
    const back = (event: PopStateEvent) => {
      const nextIndex = event.state?.tasksIndex ?? 0;
      if (returning.current) {
        returning.current = false;
        return;
      }
      if (!drafts.confirm()) {
        returning.current = true;
        history.go(index.current - nextIndex);
        return;
      }
      saveScroll();
      index.current = nextIndex;
      setRoute({ ...read(), fromHistory: true });
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [drafts.confirm]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const main = document.getElementById("tasks-content");
      if (main) main.scrollTop = positions.current.get(route.index) ?? 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [route]);
  return {
    route,
    navigate: (view: TaskLocation, space = "") => {
      if (!drafts.confirm()) return false;
      const path =
        view === "space"
          ? `/tasks?space=${encodeURIComponent(space)}`
          : `/tasks?view=${view}`;
      if (path !== location.pathname + location.search) {
        saveScroll();
        index.current += 1;
        history.pushState({ tasksIndex: index.current }, "", path);
        setRoute(read());
      }
      return true;
    },
  };
}
