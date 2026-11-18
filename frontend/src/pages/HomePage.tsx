import { useCallback, useEffect, useRef, useState } from "react";
import { useApplications } from "../platform/applications/ApplicationProvider";
import { ApplicationCarousel } from "../platform/applications/ApplicationCarousel";
import { ApplicationFooter } from "../platform/auth/ApplicationFooter";
import { useSession } from "../platform/auth/SessionProvider";
import { useNavigationGuard } from "../platform/navigation";
import {
  ApplicationSidebar,
  ApplicationTopbar,
} from "../shared/ui/ApplicationNavigation";
import { Icon } from "../shared/ui/Icon";
import { formatLocale, tr } from "../shared/i18n";
import "./home.css";

export function HomePage({
  onStart,
}: {
  onStart: (applicationId: string, text: string) => boolean;
}) {
  const { items } = useApplications();
  const { session } = useSession();
  const [sidebar, setSidebar] = useState(false);
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const ai = items?.find((item) => item.id === "life_ai");
  const permit = useCallback(
    () =>
      submitting.current ||
      !draft.trim() ||
      window.confirm(tr("progression_unsaved")),
    [draft],
  );
  useNavigationGuard(permit);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (draft.trim() && !submitting.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [draft]);
  useEffect(() => {
    document.title = "Dashboard · LifeOS";
  }, []);
  const send = () => {
    const text = draft.trim();
    if (!ai?.enabled || !text || submitting.current) return;
    submitting.current = true;
    if (onStart(ai.id, text)) setDraft("");
    else submitting.current = false;
  };
  return (
    <div
      className="dashboard-shell ui-scope"
      onClickCapture={(event) => {
        const link = (event.target as Element).closest<HTMLAnchorElement>(
          "a[href]",
        );
        if (
          link &&
          !link.getAttribute("href")?.startsWith("#") &&
          !event.ctrlKey &&
          !event.metaKey &&
          !permit()
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <ApplicationSidebar
        name="Dashboard"
        icon="grid"
        label={tr("main_navigation")}
        mainId="dashboard-main"
        open={sidebar}
        onOpenChange={setSidebar}
        footer={
          <ApplicationFooter
            documentation="applications"
            beforeSessionChange={permit}
          />
        }
      >
        <a
          className="application-nav-item is-active"
          href="/"
          aria-current="page"
        >
          <Icon name="grid" />
          {tr("home")}
        </a>
        {ai?.enabled && (
          <a className="application-nav-item" href={ai.path}>
            <Icon name="sparkles" />
            {ai.name}
          </a>
        )}
        <a className="application-nav-item" href="/settings">
          <Icon name="settings" />
          {tr("settings")}
        </a>
      </ApplicationSidebar>
      <main className="dashboard-main" id="dashboard-main" tabIndex={-1}>
        <ApplicationTopbar
          name="Dashboard"
          current={tr("dashboard_overview")}
          mainId="dashboard-main"
          open={sidebar}
          onOpenChange={setSidebar}
        />
        <div className="dashboard-content">
          <header className="dashboard-heading">
            <p className="dashboard-date">
              {new Intl.DateTimeFormat(formatLocale(), {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(new Date())}
            </p>
            <h1>{tr("dashboard_greeting", { name: session.username })}</h1>
            <p>{tr("dashboard_intro")}</p>
          </header>
          <ApplicationCarousel
            items={items?.filter((item) => item.enabled) ?? []}
          />
          <section
            className="dashboard-chat"
            aria-labelledby="dashboard-chat-title"
          >
            <div className="dashboard-chat-heading">
              <span className="dashboard-ai-icon">
                <Icon name="sparkles" size={24} />
              </span>
              <div>
                <p className="dashboard-chat-eyebrow">
                  {ai?.name ?? "Life AI"}
                </p>
                <h2 id="dashboard-chat-title">{tr("dashboard_chat_title")}</h2>
              </div>
            </div>
            <p className="dashboard-chat-description">
              {tr("dashboard_chat_description")}
            </p>
            {ai?.enabled ? (
              <>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    send();
                  }}
                >
                  <label className="sr-only" htmlFor="dashboard-message">
                    {tr("dashboard_message")}
                  </label>
                  <textarea
                    id="dashboard-message"
                    ref={field}
                    value={draft}
                    maxLength={12000}
                    rows={3}
                    placeholder={tr("dashboard_placeholder")}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        send();
                      }
                    }}
                  />
                  <div className="dashboard-compose-footer">
                    <span>{tr("dashboard_send_hint")}</span>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={!draft.trim()}
                      aria-label={tr("dashboard_send")}
                    >
                      <span>{tr("dashboard_start")}</span>
                      <Icon name="arrow" size={18} />
                    </button>
                  </div>
                </form>
                <div
                  className="dashboard-prompts"
                  aria-label={tr("dashboard_ideas")}
                >
                  {(
                    [
                      "dashboard_prompt_day",
                      "dashboard_prompt_week",
                      "dashboard_prompt_goals",
                    ] as const
                  ).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setDraft(tr(key));
                        field.current?.focus();
                      }}
                    >
                      {tr(key)}
                      <Icon name="plus" size={14} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="dashboard-chat-disabled">
                <p>{tr("dashboard_ai_disabled")}</p>
                <a className="primary-button" href="/applications">
                  {tr("open_the_library")}
                  <Icon name="arrow" />
                </a>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
