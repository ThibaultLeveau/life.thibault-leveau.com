import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { useApplications } from "../platform/applications/ApplicationProvider";
import type {
  ApplicationModule,
  SettingsPanelProps,
} from "../platform/applications/definition";
import { useSession } from "../platform/auth/SessionProvider";
import type { Theme } from "../platform/auth/types";
import type { Locale } from "../platform/i18n";
import { ProgressionSettings } from "../platform/progression/ProgressionSettings";
import { useApiAction } from "../platform/useApiResource";
import { useSettingsDraft } from "../platform/applications/useSettingsDraft";
import { ErrorMessage } from "../shared/ui/Dialog";
import { Icon, type IconName } from "../shared/ui/Icon";
import { tr } from "../shared/i18n";
import "../platform/progression/styles.css";
import "../shared/styles/navigation.css";
import "./settings.css";

const sectionFromUrl = () =>
  new URLSearchParams(location.search).get("application") || "general";
const sectionUrl = (id: string) =>
  id === "general"
    ? "/settings"
    : `/settings?application=${encodeURIComponent(id)}`;

export function SettingsPage({ modules }: { modules: ApplicationModule[] }) {
  const { items } = useApplications();
  const [section, setSection] = useState(sectionFromUrl);
  const dirty = useRef(new Set<string>()),
    pending = useRef(new Set<string>());
  const index = useRef(0),
    restoring = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const guards = useMemo(
    () =>
      Object.fromEntries(
        ["account", "application", "progression"].map((key) => [
          key,
          {
            onDirty: (value: boolean) => {
              if (value) dirty.current.add(key);
              else dirty.current.delete(key);
            },
            onBusy: (value: boolean) => {
              if (value) pending.current.add(key);
              else pending.current.delete(key);
              setBusy(pending.current.size > 0);
            },
          },
        ]),
      ) as Record<string, SettingsPanelProps>,
    [],
  );
  const permit = useCallback(() => {
    if (pending.current.size) {
      window.alert(tr("settings_busy"));
      return false;
    }
    return !dirty.current.size || window.confirm(tr("progression_unsaved"));
  }, []);
  useEffect(() => {
    index.current = history.state?.settingsIndex ?? 0;
    history.replaceState(
      { ...history.state, settingsIndex: index.current },
      "",
    );
    const pop = (event: PopStateEvent) => {
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      const next = event.state?.settingsIndex ?? 0;
      if (!permit()) {
        restoring.current = true;
        history.go(index.current - next);
        return;
      }
      index.current = next;
      setSection(sectionFromUrl());
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size || pending.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("beforeunload", unload);
    };
  }, [permit]);
  const app = items?.find((item) => item.id === section);
  const module = modules.find((item) => item.id === section);
  const title =
    section === "general"
      ? tr("settings_general")
      : (app?.name ?? tr("page_not_found"));
  useEffect(() => {
    document.title = `${title} · ${tr("settings")} · LifeOS`;
    heading.current?.focus({ preventScroll: true });
  }, [section, title]);
  useEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const reveal = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active || nav.scrollWidth <= nav.clientWidth) return;
      const box = active.getBoundingClientRect(),
        container = nav.getBoundingClientRect();
      if (box.left < container.left)
        nav.scrollLeft += box.left - container.left;
      else if (box.right > container.right)
        nav.scrollLeft += box.right - container.right;
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    reveal();
    return () => observer.disconnect();
  }, [section, title, items]);
  return (
    <AppLayout account={{ disabled: busy, beforeSessionChange: permit }}>
      <header className="settings-heading">
        <p className="eyebrow">LifeOS</p>
        <h1>{tr("settings")}</h1>
        <p>{tr("settings_description")}</p>
      </header>
      <div className="settings-layout">
        <nav
          ref={navigation}
          className="settings-navigation"
          aria-label={tr("settings_sections")}
        >
          {[
            { id: "general", name: tr("settings_general"), icon: "settings" },
            ...(items ?? []),
          ].map((item) => (
            <a
              key={item.id}
              className={`application-nav-item ${section === item.id ? "is-active" : ""}`}
              href={sectionUrl(item.id)}
              aria-current={section === item.id ? "page" : undefined}
              onClick={(event) => {
                if (
                  event.button ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                if (section === item.id || !permit()) return;
                index.current++;
                history.pushState(
                  { settingsIndex: index.current },
                  "",
                  sectionUrl(item.id),
                );
                setSection(item.id);
              }}
            >
              <Icon name={item.icon as IconName} /> <span>{item.name}</span>
            </a>
          ))}
        </nav>
        <section
          className="settings-content"
          aria-labelledby="settings-section-title"
        >
          <div className="settings-section-heading">
            <h2 id="settings-section-title" ref={heading} tabIndex={-1}>
              {title}
            </h2>
            {app && (
              <a className="text-button" href={app.path}>
                {tr("open_application", { name: app.name })}
                <Icon name="arrow" size={16} />
              </a>
            )}
          </div>
          {section === "general" ? (
            <div key="general" className="settings-panels">
              <AccountSettings {...guards.account} permit={permit} />
              <div className="settings-card">
                <ProgressionSettings scope="general" {...guards.progression} />
              </div>
            </div>
          ) : app ? (
            <div key={`${app.id}:${app.enabled}`} className="settings-panels">
              {!app.enabled && (
                <div className="settings-card">
                  <h3>{tr("application_disabled", { name: app.name })}</h3>
                  <p>
                    {tr(
                      "your_data_is_preserved_enable_the_application_again_to_access",
                    )}
                  </p>
                  <a className="text-button" href="/applications">
                    {tr("open_the_library")}
                  </a>
                </div>
              )}
              {app.enabled && module?.Settings && (
                <div className="settings-card">
                  <Suspense
                    fallback={<p role="status">{tr("settings_loading")}</p>}
                  >
                    <module.Settings {...guards.application} />
                  </Suspense>
                </div>
              )}
              {app.enabled && !module?.Settings && (
                <p className="muted">{tr("settings_no_specific")}</p>
              )}
              <div className="settings-card">
                <ProgressionSettings scope={app.id} {...guards.progression} />
              </div>
            </div>
          ) : (
            <a href="/settings">{tr("settings_general")}</a>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
function AccountSettings(
  props: SettingsPanelProps & { permit: () => boolean },
) {
  const { session, changeTheme, changeLocale } = useSession();
  const action = useApiAction();
  useSettingsDraft(props, false, action.busy);
  return (
    <section className="settings-card settings-form">
      <h3>{tr("settings_account")}</h3>
      <p className="muted">{tr("settings_autosave")}</p>
      <fieldset disabled={action.busy}>
        <label>
          {tr("appearance")}
          <select
            value={session.theme}
            onChange={(e) =>
              void action.run(
                () => changeTheme(e.target.value as Theme),
                () => {},
              )
            }
          >
            <option value="system">{tr("system_theme")}</option>
            <option value="light">{tr("light_theme")}</option>
            <option value="dark">{tr("dark_theme")}</option>
          </select>
        </label>
        <label>
          {tr("language")}
          <select
            value={session.locale}
            onChange={(e) => {
              const locale = e.target.value as Locale;
              if (props.permit())
                void action.run(
                  () => changeLocale(locale),
                  () => {},
                );
            }}
          >
            <option value="fr" lang="fr">
              Français
            </option>
            <option value="en" lang="en">
              English
            </option>
          </select>
        </label>
      </fieldset>
      <ErrorMessage message={action.error} />
    </section>
  );
}
