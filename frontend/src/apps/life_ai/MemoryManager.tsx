import { useEffect, useState } from "react";
import { formatLocale } from "../../shared/i18n";
import { tr } from "./i18n";
import { ErrorMessage } from "../../shared/ui/Dialog";
import { Icon } from "../../shared/ui/Icon";
import type { SettingsPanelProps } from "../../platform/applications/definition";
import { useSettingsDraft } from "../../platform/applications/useSettingsDraft";
import { useApiAction, useApiResource } from "../../platform/useApiResource";
import { assistantApi } from "./api";
import type { Memory } from "./types";
const noop = () => {};
export function MemoryManager({
  onDirty = noop,
  onBusy = noop,
}: Partial<SettingsPanelProps>) {
  const [offset, setOffset] = useState(0);
  const [memories, setMemories] = useState<Memory[]>([]);
  const resource = useApiResource(
    (signal) => assistantApi.memories(signal, offset),
    [offset],
  );
  useEffect(() => {
    const data = resource.data;
    if (data)
      setMemories((previous) =>
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
  function reload() {
    setOffset(0);
    resource.reload();
  }
  const action = useApiAction();
  const [editing, setEditing] = useState<Memory | "new" | null>(null);
  const [content, setContent] = useState("");
  const dirty =
    !!editing && content !== (editing === "new" ? "" : editing.content);
  useSettingsDraft({ onDirty, onBusy }, dirty, action.busy);
  function edit(memory: Memory | "new" | null) {
    if (action.busy || (dirty && !window.confirm(tr("assistant_unsaved"))))
      return;
    setEditing(memory);
    setContent(memory && memory !== "new" ? memory.content : "");
  }
  return (
    <section className="assistant-memories">
      <p className="muted">{tr("assistant_memory_description")}</p>
      <p className="muted small-text">{tr("assistant_memory_separate")}</p>
      <div className="assistant-actions">
        <button
          className="secondary-button"
          disabled={action.busy}
          onClick={() => edit("new")}
        >
          <Icon name="plus" />
          {tr("assistant_memory_add")}
        </button>
        {!!memories.length && (
          <button
            className="text-button"
            disabled={action.busy || dirty}
            onClick={() => {
              if (window.confirm(tr("assistant_memory_confirm_all")))
                void action.run(
                  () => assistantApi.forget(),
                  () => {
                    setEditing(null);
                    setContent("");
                    reload();
                  },
                );
            }}
          >
            {tr("assistant_memory_forget_all")}
          </button>
        )}
      </div>
      {editing && (
        <form
          className="assistant-memory-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              () =>
                editing === "new"
                  ? assistantApi.remember(content.trim())
                  : assistantApi.editMemory(editing.id, content.trim()),
              () => {
                setEditing(null);
                setContent("");
                reload();
              },
            );
          }}
        >
          <label>
            {tr("assistant_memory_content")}
            <textarea
              autoFocus
              rows={3}
              value={content}
              required
              maxLength={1000}
              onChange={(event) => setContent(event.target.value)}
              disabled={action.busy}
            />
          </label>
          <div className="assistant-actions">
            <button
              className="primary-button"
              disabled={action.busy || !content.trim()}
            >
              {tr("assistant_save")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={action.busy}
              onClick={() => edit(null)}
            >
              {tr("assistant_cancel")}
            </button>
          </div>
        </form>
      )}
      <ErrorMessage message={action.error || resource.error} />
      {resource.error && (
        <button className="secondary-button" onClick={resource.reload}>
          {tr("try_again")}
        </button>
      )}
      {resource.loading && <p role="status">{tr("settings_loading")}</p>}
      {resource.data && !memories.length && (
        <p className="assistant-memory-empty">{tr("assistant_memory_empty")}</p>
      )}
      <ul className="assistant-memory-list">
        {memories.map((memory) => (
          <li key={memory.id}>
            <Icon name="memory" />
            <div>
              <p>{memory.content}</p>
              <small className="muted">
                {tr("assistant_memory_updated", {
                  date: new Date(memory.updated_at).toLocaleDateString(
                    formatLocale(),
                  ),
                })}
              </small>
              {memory.source_conversation_id && (
                <a
                  className="assistant-memory-source"
                  href={`/?conversation=${encodeURIComponent(memory.source_conversation_id)}`}
                >
                  {tr("assistant_memory_source")}
                  <Icon name="arrow" size={13} />
                </a>
              )}
            </div>
            <div className="assistant-memory-controls">
              <button
                type="button"
                className="icon-button"
                aria-label={tr("assistant_memory_edit")}
                disabled={action.busy}
                onClick={() => edit(memory)}
              >
                <Icon name="edit" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={tr("assistant_memory_forget")}
                disabled={action.busy || dirty}
                onClick={() =>
                  void action.run(
                    () => assistantApi.forget(memory.id),
                    () => {
                      if (editing !== "new" && editing?.id === memory.id)
                        setEditing(null);
                      reload();
                    },
                  )
                }
              >
                <Icon name="trash" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {resource.data && memories.length < resource.data.total && (
        <button
          type="button"
          className="secondary-button"
          disabled={resource.loading || action.busy}
          onClick={() => setOffset(memories.length)}
        >
          {tr("assistant_more")}
        </button>
      )}
    </section>
  );
}
