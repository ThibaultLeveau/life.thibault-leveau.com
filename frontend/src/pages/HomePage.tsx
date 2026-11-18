import { useCallback, useEffect, useRef, useState } from "react";
import { formatLocale, tr } from "../shared/i18n";
import { useApplications } from "../platform/applications/ApplicationProvider";
import type { ApplicationModule } from "../platform/applications/definition";
import {
  ApplicationSidebar,
  ApplicationTopbar,
} from "../shared/ui/ApplicationNavigation";
import { ApplicationFooter } from "../platform/auth/ApplicationFooter";
import { Dialog, ErrorMessage } from "../shared/ui/Dialog";
import { Icon, type IconName } from "../shared/ui/Icon";
import { useApiAction, useApiResource } from "../platform/useApiResource";
import { assistantApi } from "../platform/assistant/api";
import { useConversation } from "../platform/assistant/useConversation";
import { MemoryManager } from "../platform/assistant/MemoryManager";
import { Welcome } from "../platform/assistant/components/Welcome";
import { ConversationHistory } from "../platform/assistant/components/ConversationHistory";
import { MessageList } from "../platform/assistant/components/MessageList";
import { useSourceDraft } from "../platform/assistant/useSourceDraft";
import { useDictation } from "../platform/assistant/useDictation";
import type { AssistantDraft } from "../platform/assistant/types";
import { Composer } from "../platform/assistant/components/Composer";
import "../platform/assistant/styles.css";

const conversationFromUrl = () =>
  new URLSearchParams(location.search).get("conversation");
const conversationUrl = (id: string | null) =>
  id ? `/?conversation=${encodeURIComponent(id)}` : "/";
export function HomePage({ modules }: { modules: ApplicationModule[] }) {
  const { items } = useApplications();
  const enabled = items?.filter((item) => item.enabled) ?? [];
  const [id, setId] = useState(conversationFromUrl);
  const [sidebar, setSidebar] = useState(false),
    [memoryOpen, setMemoryOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const operations = useRef(new Set<string>());
  const [operationBusy, setOperationBusy] = useState(false);
  const onOperationBusy = useCallback((id: string, value: boolean) => {
    if (value) operations.current.add(id);
    else operations.current.delete(id);
    setOperationBusy(operations.current.size > 0);
  }, []);
  const [draft, setDraft] = useState(""),
    [visible, setVisible] = useState(40),
    [atBottom, setAtBottom] = useState(true);
  const sources = useSourceDraft();
  const [urlDirty, setUrlDirty] = useState(false);
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [dictationOverflow, setDictationOverflow] = useState("");
  const dictation = useDictation((text) => {
    setDraft((value) => {
      const combined = `${value}${value && !/\s$/.test(value) ? " " : ""}${text}`;
      if (combined.length > 12000) {
        setDictationOverflow(text);
        return value;
      }
      return combined;
    });
  });
  const inputDirty =
    !!sources.items.length ||
    dictation.active ||
    dictation.retryAvailable ||
    urlDirty ||
    !!dictationOverflow;
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null),
    [title, setTitle] = useState(""),
    [forgetRelated, setForgetRelated] = useState(false);
  const memoryDirty = useRef(false),
    memoryBusy = useRef(false),
    index = useRef(0),
    restoring = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null),
    scroller = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  const settings = useApiResource(assistantApi.settings, []);
  const action = useApiAction();
  const changed = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);
  const created = useCallback((next: string) => {
    window.history.replaceState(
      { ...window.history.state, assistantIndex: index.current },
      "",
      conversationUrl(next),
    );
    setId(next);
  }, []);
  const sourceRestore = useRef(sources.restore);
  sourceRestore.current = sources.restore;
  const rejected = useCallback((value: AssistantDraft) => {
    setDraft((draft) => draft || value.content);
    sourceRestore.current(value.sources);
  }, []);
  const chat = useConversation(id, created, changed, rejected);
  const busy = chat.busy || !!chat.runId || action.busy || operationBusy;
  const permit = useCallback(() => {
    if (busy || memoryBusy.current) {
      window.alert(tr("assistant_busy"));
      return false;
    }
    return (
      (!draft.trim() &&
        !inputDirty &&
        !memoryDirty.current &&
        !(dialog === "rename" && title !== chat.conversation?.title)) ||
      window.confirm(tr("assistant_unsaved"))
    );
  }, [busy, draft, inputDirty, dialog, title, chat.conversation?.title]);
  function clearDraft() {
    setDraft("");
    sources.clear();
    dictation.cancel();
    setDictationOverflow("");
    setUrlDirty(false);
    setDraftGeneration((value) => value + 1);
  }
  const navigate = (next: string | null) => {
    if (next === id || !permit()) return;
    index.current++;
    window.history.pushState(
      { assistantIndex: index.current },
      "",
      conversationUrl(next),
    );
    setId(next);
    clearDraft();
    setSidebar(false);
    setVisible(40);
    follow.current = true;
  };
  useEffect(() => {
    index.current = window.history.state?.assistantIndex ?? 0;
    window.history.replaceState(
      { ...window.history.state, assistantIndex: index.current },
      "",
    );
    const pop = (event: PopStateEvent) => {
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      const next = event.state?.assistantIndex ?? 0;
      if (!permit()) {
        restoring.current = true;
        window.history.go(index.current - next);
        return;
      }
      index.current = next;
      setId(conversationFromUrl());
      clearDraft();
      setVisible(40);
      follow.current = true;
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (
        busy ||
        draft.trim() ||
        inputDirty ||
        memoryDirty.current ||
        memoryBusy.current
      ) {
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
  }, [permit, busy, draft, inputDirty]);
  useEffect(() => {
    document.title = `${chat.conversation?.title || tr("assistant")} · LifeOS`;
  }, [chat.conversation?.title]);
  useEffect(() => {
    if (follow.current)
      scroller.current?.scrollTo({
        top: scroller.current.scrollHeight,
        behavior: "instant",
      });
  }, [chat.messages, chat.status]);
  function send() {
    if (
      (!draft.trim() && !sources.items.length) ||
      !sources.ready ||
      dictation.active ||
      busy ||
      !settings.data?.configured ||
      chat.conversation?.archived
    )
      return;
    const content = draft.trim();
    setDraft("");
    follow.current = true;
    setAtBottom(true);
    const attached = sources.sources;
    sources.clear(false);
    void chat.send({ content, sources: attached });
    composer.current?.focus();
  }
  const closeMemory = () => {
    if (
      !memoryBusy.current &&
      (!memoryDirty.current || window.confirm(tr("assistant_unsaved")))
    )
      setMemoryOpen(false);
  };
  return (
    <div
      className="assistant-shell ui-scope"
      onClickCapture={(event) => {
        const link = (event.target as Element).closest<HTMLAnchorElement>(
          "a[href]",
        );
        if (
          link &&
          !link.hasAttribute("download") &&
          !link.getAttribute("href")?.startsWith("#") &&
          !event.ctrlKey &&
          !event.metaKey &&
          (draft.trim() ||
            inputDirty ||
            busy ||
            memoryDirty.current ||
            memoryBusy.current) &&
          !permit()
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <ApplicationSidebar
        name={tr("assistant")}
        icon="sparkles"
        label={tr("main_navigation")}
        mainId="assistant-main"
        open={sidebar}
        onOpenChange={setSidebar}
        footer={
          <ApplicationFooter
            documentation="assistant"
            disabled={busy || memoryBusy.current}
            beforeSessionChange={permit}
          />
        }
      >
        <button
          className="application-nav-item"
          onClick={() => {
            if (!id) {
              if (permit()) {
                clearDraft();
                setSidebar(false);
                requestAnimationFrame(() => composer.current?.focus());
              }
            } else navigate(null);
          }}
        >
          <Icon name="plus" />
          {tr("assistant_new")}
        </button>
        <button
          className="application-nav-item"
          onClick={() => {
            setMemoryOpen(true);
            setSidebar(false);
          }}
        >
          <Icon name="memory" />
          {tr("assistant_memory")}
        </button>
        <a className="application-nav-item" href="/settings#assistant-settings">
          <Icon name="settings" />
          {tr("settings")}
        </a>
        <ConversationHistory
          current={id}
          revision={revision}
          onOpen={navigate}
        />
        {!!enabled.length && (
          <div className="assistant-app-links">
            <p className="assistant-sidebar-caption">{tr("assistant_apps")}</p>
            {enabled.map((app) => (
              <a key={app.id} className="application-nav-item" href={app.path}>
                <Icon name={app.icon as IconName} size={16} />
                <span>{app.name}</span>
              </a>
            ))}
          </div>
        )}
      </ApplicationSidebar>
      <main id="assistant-main" tabIndex={-1} className="assistant-main">
        <ApplicationTopbar
          name={tr("assistant")}
          current={chat.conversation?.title || tr("assistant_new")}
          mainId="assistant-main"
          open={sidebar}
          onOpenChange={setSidebar}
        />
        <div
          className="assistant-scroll"
          ref={scroller}
          onScroll={() => {
            const element = scroller.current!;
            const bottom =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              100;
            follow.current = bottom;
            setAtBottom(bottom);
          }}
        >
          <div className="assistant-thread">
            {chat.conversation && (
              <h1 className="sr-only">{chat.conversation.title}</h1>
            )}
            {chat.conversation && (
              <div className="assistant-conversation-tools">
                <span>
                  {new Date(chat.conversation.updated_at).toLocaleDateString(
                    formatLocale(),
                    { day: "numeric", month: "long" },
                  )}
                </span>
                <div>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={tr("assistant_rename")}
                    onClick={() => {
                      setTitle(chat.conversation!.title);
                      setDialog("rename");
                    }}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={tr(
                      chat.conversation.archived
                        ? "assistant_restore"
                        : "assistant_archive",
                    )}
                    onClick={() =>
                      void action.run(
                        () =>
                          assistantApi.update(id!, {
                            archived: !chat.conversation!.archived,
                          }),
                        () => {
                          void chat.refresh();
                          changed();
                        },
                      )
                    }
                  >
                    <Icon
                      name={chat.conversation.archived ? "restore" : "archive"}
                      size={16}
                    />
                  </button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={tr("assistant_delete")}
                    onClick={() => {
                      setForgetRelated(false);
                      setDialog("delete");
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            )}
            {chat.loading && (
              <div className="assistant-skeleton" role="status">
                <span className="sr-only">{tr("assistant_loading")}</span>
                <i />
                <i />
                <i />
              </div>
            )}
            {!chat.loading && !chat.messages.length && !id && (
              <Welcome
                applications={enabled}
                onPrompt={(value) => {
                  setDraft(value);
                  composer.current?.focus();
                }}
              />
            )}
            {(chat.messages.length > visible || chat.hasMore) && (
              <button
                className="assistant-earlier secondary-button"
                disabled={chat.loadingEarlier || busy}
                onClick={async () => {
                  const height = scroller.current?.scrollHeight ?? 0;
                  follow.current = false;
                  if (visible >= chat.messages.length) await chat.earlier();
                  setVisible((value) => value + 100);
                  requestAnimationFrame(() => {
                    if (scroller.current)
                      scroller.current.scrollTop +=
                        scroller.current.scrollHeight - height;
                  });
                }}
              >
                {tr("assistant_previous")}
              </button>
            )}
            <MessageList
              messages={chat.messages.slice(-visible)}
              modules={modules}
              busy={busy}
              streaming={chat.busy}
              beforeChange={permit}
              onBusy={onOperationBusy}
              onChanged={() => void chat.refresh()}
            />
            {chat.busy && (
              <div className="assistant-run-status" role="status">
                <span className="assistant-pulse">
                  <i />
                  <i />
                  <i />
                </span>
                {chat.status || tr("assistant_sending")}
              </div>
            )}
            <ErrorMessage
              message={chat.error || action.error || settings.error}
            />
            {chat.error && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void chat.refresh()}
              >
                {tr("assistant_retry")}
              </button>
            )}
            {settings.error && (
              <button className="secondary-button" onClick={settings.reload}>
                {tr("try_again")}
              </button>
            )}
          </div>
        </div>
        <Composer
          key={draftGeneration}
          sources={sources}
          dictation={dictation}
          onUrlDirty={setUrlDirty}
          settings={settings.data}
          value={draft}
          onChange={setDraft}
          field={composer}
          loading={chat.loading}
          archived={!!chat.conversation?.archived}
          running={chat.busy || !!chat.runId}
          busy={busy}
          onSend={send}
          onStop={() => void chat.stop()}
          showLatest={!atBottom && !!chat.messages.length}
          onLatest={() => {
            follow.current = true;
            setAtBottom(true);
            scroller.current?.scrollTo({
              top: scroller.current.scrollHeight,
              behavior: "instant",
            });
          }}
        />
      </main>
      {!!dictationOverflow && (
        <Dialog
          title={tr("assistant_dictation_overflow")}
          onClose={() => setDictationOverflow("")}
        >
          <p>{tr("assistant_dictation_overflow_help")}</p>
          <textarea
            className="assistant-transcript-overflow"
            aria-label={tr("assistant_dictation_transcript")}
            value={dictationOverflow}
            readOnly
            rows={8}
          />
          <button
            className="secondary-button"
            onClick={() => setDictationOverflow("")}
          >
            {tr("close")}
          </button>
        </Dialog>
      )}
      {memoryOpen && (
        <Dialog title={tr("assistant_memory")} onClose={closeMemory}>
          <div className="assistant-memory-dialog">
            <MemoryManager
              onDirty={(value) => {
                memoryDirty.current = value;
              }}
              onBusy={(value) => {
                memoryBusy.current = value;
              }}
            />
          </div>
        </Dialog>
      )}
      {dialog && (
        <Dialog
          title={tr(
            dialog === "rename" ? "assistant_rename" : "assistant_delete",
          )}
          onClose={() => {
            if (
              !action.busy &&
              (dialog !== "rename" ||
                title === chat.conversation?.title ||
                window.confirm(tr("assistant_unsaved")))
            )
              setDialog(null);
          }}
        >
          <form
            className="assistant-dialog-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(
                async () => {
                  if (dialog === "rename")
                    await assistantApi.update(id!, { title: title.trim() });
                  else await assistantApi.delete(id!, forgetRelated);
                },
                () => {
                  const deleting = dialog === "delete";
                  setDialog(null);
                  changed();
                  if (deleting) {
                    window.history.replaceState(
                      { ...window.history.state },
                      "",
                      "/",
                    );
                    setId(null);
                    clearDraft();
                    setVisible(40);
                    setAtBottom(true);
                    follow.current = true;
                  } else void chat.refresh();
                },
              );
            }}
          >
            {dialog === "rename" ? (
              <label>
                {tr("assistant_title")}
                <input
                  required
                  maxLength={160}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={action.busy}
                />
              </label>
            ) : (
              <>
                <p>{tr("assistant_delete_description")}</p>
                <label className="assistant-check">
                  <input
                    type="checkbox"
                    checked={forgetRelated}
                    onChange={(event) => setForgetRelated(event.target.checked)}
                    disabled={action.busy}
                  />
                  <span>{tr("assistant_forget_related")}</span>
                </label>
              </>
            )}
            <ErrorMessage message={action.error} />
            <div className="assistant-actions">
              <button
                className="primary-button"
                disabled={action.busy || (dialog === "rename" && !title.trim())}
              >
                {tr(
                  dialog === "rename" ? "assistant_save" : "assistant_delete",
                )}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={action.busy}
                onClick={() => setDialog(null)}
              >
                {tr("assistant_cancel")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      <span className="sr-only" role="status" aria-atomic="true">
        {!chat.busy && !chat.runId && chat.messages.at(-1)?.role === "assistant"
          ? `${tr("assistant_finished")}. ${chat.messages.at(-1)?.content ?? ""}`
          : ""}
      </span>
    </div>
  );
}
