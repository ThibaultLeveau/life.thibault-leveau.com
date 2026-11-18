import { useEffect, useRef, useState } from "react";

const changed = "life-navigation";
const before = "life-before-navigation";
type NavigationKind = "push" | "replace" | "pop";

function permit() {
  return window.dispatchEvent(new Event(before, { cancelable: true }));
}
function notify(kind: NavigationKind) {
  window.dispatchEvent(new CustomEvent(changed, { detail: kind }));
}
/** Same-document navigation stores only a position, never a private draft. */
export function navigateLocation(url: string) {
  if (!permit()) return false;
  history.pushState(
    { lifeIndex: (history.state?.lifeIndex ?? 0) + 1 },
    "",
    url,
  );
  notify("push");
  return true;
}
export function replaceLocation(url: string) {
  history.replaceState({ ...history.state }, "", url);
  notify("replace");
}
export function useNavigationGuard(guard: () => boolean) {
  const current = useRef(guard);
  current.current = guard;
  useEffect(() => {
    const check = (event: Event) => {
      if (!current.current()) event.preventDefault();
    };
    window.addEventListener(before, check);
    return () => window.removeEventListener(before, check);
  }, []);
}
export function onHistoryNavigation(callback: () => void) {
  const listener = (event: Event) => {
    if ((event as CustomEvent<NavigationKind>).detail === "pop") callback();
  };
  window.addEventListener(changed, listener);
  return () => window.removeEventListener(changed, listener);
}
export function useShellLocation() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    let index = history.state?.lifeIndex ?? 0;
    let restoring = false;
    history.replaceState({ ...history.state, lifeIndex: index }, "");
    const accept = () => {
      index = history.state?.lifeIndex ?? 0;
      setPath(location.pathname);
    };
    const pop = () => {
      if (restoring) {
        restoring = false;
        return;
      }
      const next = history.state?.lifeIndex ?? 0;
      if (!permit()) {
        restoring = true;
        history.go(index - next);
        return;
      }
      notify("pop");
    };
    window.addEventListener(changed, accept);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener(changed, accept);
      window.removeEventListener("popstate", pop);
    };
  }, []);
  return path;
}
