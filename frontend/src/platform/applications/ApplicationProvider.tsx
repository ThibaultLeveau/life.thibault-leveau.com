import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getApplications, setApplication } from "./api";
import type { Application } from "./types";

interface ApplicationsContext {
  items: Application[] | null;
  error: string;
  actionError: string;
  busy: boolean;
  notice: string;
  refresh: () => void;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
}
const Context = createContext<ApplicationsContext | null>(null);
export function ApplicationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const mounted = useRef(true);
  const read = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    if (writing.current) return;
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setError("");
    getApplications(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setItems(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
  }, []);
  useEffect(() => {
    mounted.current = true;
    refresh();
    const focus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const disabled = (event: Event) => {
      read.current?.abort();
      const id = (event as CustomEvent<string>).detail;
      setItems(
        (items) =>
          items?.map((item) =>
            item.id === id ? { ...item, enabled: false } : item,
          ) ?? null,
      );
    };
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("life-application-disabled", disabled);
    return () => {
      mounted.current = false;
      read.current?.abort();
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("life-application-disabled", disabled);
    };
  }, [refresh]);
  async function setEnabled(id: string, enabled: boolean) {
    if (writing.current) return;
    writing.current = true;
    read.current?.abort();
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const result = await setApplication(id, enabled);
      if (!mounted.current) return;
      setItems(
        (items) =>
          items?.map((item) => (item.id === id ? result : item)) ?? null,
      );
      setNotice(`${result.name} ${result.enabled ? "activée" : "désactivée"}.`);
    } catch (error) {
      if (mounted.current) setActionError((error as Error).message);
    } finally {
      writing.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{ items, error, actionError, busy, notice, refresh, setEnabled }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApplications() {
  const context = useContext(Context);
  if (!context) throw new Error("ApplicationProvider requis");
  return context;
}
