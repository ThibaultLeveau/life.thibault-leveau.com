import { useEffect, useState } from "react";
import { tr } from "../i18n";
import { Icon } from "../../../shared/ui/Icon";
import { ErrorMessage } from "../../../shared/ui/Dialog";
import { useApiResource } from "../../../platform/useApiResource";
import { assistantApi } from "../api";
import type { Conversation } from "../types";
export function ConversationHistory({
  current,
  revision,
  onOpen,
}: {
  current: string | null;
  revision: number;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false),
    [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Conversation[]>([]);
  const resource = useApiResource(
    (signal) => assistantApi.conversations(search, archived, offset, signal),
    [search, archived, offset, revision],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setOffset(0);
  }, [revision]);
  useEffect(() => {
    const data = resource.data;
    if (data)
      setItems((previous) =>
        offset
          ? [
              ...previous.filter(
                (item) => !data.items.some((value) => value.id === item.id),
              ),
              ...data.items,
            ]
          : data.items,
      );
  }, [resource.data, offset]);
  return (
    <>
      <div className="assistant-history-heading">
        <span>{tr("assistant_history")}</span>
        <button
          className="icon-button"
          aria-label={tr(archived ? "assistant_recent" : "assistant_archived")}
          aria-pressed={archived}
          onClick={() => {
            setArchived(!archived);
            setOffset(0);
          }}
        >
          <Icon name="archive" size={16} />
        </button>
      </div>
      <label className="assistant-history-search">
        <Icon name="search" size={15} />
        <input
          value={query}
          maxLength={160}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tr("assistant_search")}
          aria-label={tr("assistant_search")}
        />
      </label>
      {archived && (
        <p className="assistant-sidebar-caption">{tr("assistant_archived")}</p>
      )}
      {items.map((conversation) => (
        <a
          key={conversation.id}
          className={`application-nav-item assistant-history-item ${conversation.id === current ? "is-active" : ""}`}
          href={`/?conversation=${encodeURIComponent(conversation.id)}`}
          aria-current={conversation.id === current ? "page" : undefined}
          onClick={(event) => {
            if (
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              !event.altKey &&
              !event.button
            ) {
              event.preventDefault();
              onOpen(conversation.id);
            }
          }}
        >
          <Icon name="message" size={16} />
          <span>{conversation.title}</span>
        </a>
      ))}
      {!resource.loading && !items.length && (
        <p className="assistant-sidebar-caption">
          {tr("assistant_empty_history")}
        </p>
      )}
      {resource.loading && (
        <p className="assistant-sidebar-caption" role="status">
          {tr("assistant_loading")}
        </p>
      )}
      <ErrorMessage message={resource.error} />
      {resource.error && (
        <button className="application-nav-item" onClick={resource.reload}>
          {tr("try_again")}
        </button>
      )}
      {resource.data && items.length < resource.data.total && (
        <button
          className="application-nav-item"
          disabled={resource.loading}
          onClick={() => setOffset(items.length)}
        >
          {tr("assistant_more")}
        </button>
      )}
    </>
  );
}
