import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { sportApi } from "./api";
import type { SportSettings, ViewMode, ViewSection } from "./types";
import { LoadState, useAction, useResource } from "./components/common";
import { Icon } from "../../shared/ui/Icon";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { tr } from "./i18n";

const Preferences = createContext<{
  settings: SportSettings;
  accept: (settings: SportSettings) => void;
  reload: () => void;
} | null>(null);

export function SportPreferences({ children }: { children: ReactNode }) {
  const resource = useResource(sportApi.settings, []);
  const [settings, setSettings] = useState<SportSettings>();
  useEffect(() => {
    if (resource.data) setSettings(resource.data);
  }, [resource.data]);
  return (
    <>
      <LoadState {...resource} />
      {settings && (
        <Preferences.Provider
          value={{ settings, accept: setSettings, reload: resource.reload }}
        >
          {children}
        </Preferences.Provider>
      )}
    </>
  );
}

export function useSportSettings() {
  const value = useContext(Preferences);
  if (!value) throw new Error("Sport preferences provider is required");
  return value;
}

export function useView(section: ViewSection) {
  const { settings, accept, reload } = useSportSettings();
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 800px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 800px)");
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const key: `${ViewSection}_view` | `${ViewSection}_mobile_view` =
    `${section}${mobile ? "_mobile" : ""}_view`;
  const action = useAction();
  const list = useRef<HTMLDivElement>(null);
  function change(value: ViewMode) {
    if (value === settings[key]) return;
    // Keep the first visible record anchored when a dense layout replaces cards.
    const visible = [
      ...(list.current?.querySelectorAll<HTMLElement>("[data-record]") ?? []),
    ].find((element) => element.getBoundingClientRect().bottom > 80);
    const top = visible?.getBoundingClientRect().top;
    void action.run(
      () =>
        sportApi.write<SportSettings>("/settings", {
          [key]: value,
          expected_version: settings.version,
        }),
      (next) => {
        accept(next);
        requestAnimationFrame(() => {
          if (visible?.isConnected && top !== undefined) {
            const delta = visible.getBoundingClientRect().top - top;
            const shell = visible.closest<HTMLElement>(".sport-shell");
            if (shell && shell.scrollHeight > shell.clientHeight)
              shell.scrollBy({ top: delta, behavior: "instant" });
            else window.scrollBy({ top: delta, behavior: "instant" });
          }
        });
      },
    );
  }
  const controls = (
    <div className="sport-view-controls">
      <div
        className="sport-view-switch"
        role="group"
        aria-label={tr("view_for", {
          section: tr(
            section === "workouts"
              ? "programs"
              : section === "exercises"
                ? "exercises"
                : "body_measurements",
          ),
        })}
      >
        {(["list", "grid"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            aria-pressed={settings[key] === mode}
            aria-disabled={action.busy}
            onClick={() => change(mode)}
          >
            <Icon name={mode} />
            {tr(mode === "list" ? "view_list" : "view_grid")}
          </button>
        ))}
      </div>
      {action.busy && (
        <span className="muted" role="status">
          {tr("saving")}
        </span>
      )}
      <ErrorMessage message={action.error} />
      {action.error && (
        <button type="button" className="text-button" onClick={reload}>
          {tr("reload_preferences")}
        </button>
      )}
    </div>
  );
  return { view: settings[key], controls, list };
}
