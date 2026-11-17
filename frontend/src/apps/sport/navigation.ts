import { useCallback, useEffect, useState } from "react";

/** Public navigation state only: drafts and private records never leave React. */
export function useSportQuery<T extends Record<string, string>>(defaults: T) {
  const read = useCallback(() => {
    const params = new URLSearchParams(location.search);
    return Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => [
        key,
        params.get(key) ?? fallback,
      ]),
    ) as T;
  }, [JSON.stringify(defaults)]);
  const [values, setValues] = useState(read);
  useEffect(() => {
    const sync = () => setValues(read());
    window.addEventListener("popstate", sync);
    window.addEventListener("sport-query-change", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("sport-query-change", sync);
    };
  }, [read]);
  function update(changes: Partial<T>, push = false) {
    const params = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === "" || value === undefined) params.delete(key);
      else params.set(key, value);
    }
    const state = { ...history.state };
    if (push) state.sportIndex = (state.sportIndex ?? 0) + 1;
    history[push ? "pushState" : "replaceState"](state, "", `?${params}`);
    window.dispatchEvent(new Event("sport-query-change"));
  }
  return [values, update] as const;
}

export function queryString(values: Record<string, string | undefined>) {
  return new URLSearchParams(
    Object.entries(values).filter(
      (entry): entry is [string, string] => !!entry[1],
    ),
  ).toString();
}

export function pageOffset(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export type SportTab =
  | "workouts"
  | "training"
  | "exercises"
  | "measurements"
  | "statistics"
  | "history"
  | "settings";
export type SportNavigate = (
  tab: SportTab,
  params?: Record<string, string>,
) => void;
