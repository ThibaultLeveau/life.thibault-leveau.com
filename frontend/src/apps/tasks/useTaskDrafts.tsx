import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { tr } from "./i18n";

const snapshot = (form: HTMLFormElement) =>
  JSON.stringify(
    [...new FormData(form)].map(([key, value]) => [key, String(value)]),
  );
interface Draft {
  form: HTMLFormElement;
  clean: string;
  extra: string;
  current: () => string;
}
interface Drafts {
  entries: Map<HTMLFormElement, Draft>;
  confirm: (scope?: HTMLElement | null) => boolean;
}
const Context = createContext<Drafts | null>(null);
const dirty = (draft: Draft) =>
  snapshot(draft.form) !== draft.clean || draft.current() !== draft.extra;
export function TaskDraftProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<HTMLFormElement, Draft>()).current;
  const confirm = useCallback(
    (scope?: HTMLElement | null) => {
      const changed = [...entries.values()].filter(
        (draft) =>
          draft.form.isConnected &&
          (!scope || scope.contains(draft.form)) &&
          dirty(draft),
      );
      if (changed.length && !window.confirm(tr("discard_draft"))) return false;
      for (const draft of changed) {
        draft.clean = snapshot(draft.form);
        draft.extra = draft.current();
      }
      return true;
    },
    [entries],
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (
        [...entries.values()].some(
          (draft) => draft.form.isConnected && dirty(draft),
        )
      )
        event.preventDefault();
    };
    const followLink = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        link.target === "_blank" ||
        link.getAttribute("href")?.startsWith("#")
      )
        return;
      if (!confirm()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", followLink, true);
    };
  }, [entries, confirm]);
  return (
    <Context.Provider value={{ entries, confirm }}>{children}</Context.Provider>
  );
}
export function useTaskDrafts() {
  const value = useContext(Context);
  if (!value) throw new Error("Task drafts require the Tasks page");
  return value;
}
export function useDraftForm(extra?: unknown) {
  const drafts = useTaskDrafts();
  const current = useRef(extra);
  current.current = extra;
  const element = useRef<HTMLFormElement | null>(null);
  const [cleanRevision, setCleanRevision] = useState(0);
  const ref = useCallback(
    (form: HTMLFormElement | null) => {
      if (element.current) drafts.entries.delete(element.current);
      element.current = form;
      if (form)
        drafts.entries.set(form, {
          form,
          clean: snapshot(form),
          extra: JSON.stringify(current.current),
          current: () => JSON.stringify(current.current),
        });
    },
    [drafts.entries],
  );
  const clean = () => {
    const entry = element.current && drafts.entries.get(element.current);
    if (entry) {
      entry.clean = snapshot(entry.form);
      entry.extra = entry.current();
    }
  };
  useLayoutEffect(() => {
    if (cleanRevision) clean();
  }, [cleanRevision]);
  return {
    ref,
    clean,
    // Capture the reset form after React commits, before the next input event.
    cleanOnCommit: () => setCleanRevision((value) => value + 1),
    leave: (action: () => void) => {
      if (drafts.confirm(element.current)) action();
    },
  };
}
