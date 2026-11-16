import { useEffect, useState } from "react";
import { useApiAction, useApiResource } from "../../../platform/useApiResource";
import { Dialog, ErrorMessage } from "../../../shared/ui/Dialog";
import { Icon } from "../../../shared/ui/Icon";
import { okrApi } from "../api";
import { dateLabel, number, quarterLabel, tr, type MessageKey } from "../i18n";
import { resultProgress, type KeyResult, type Objective } from "../types";
import { LoadState, Progress } from "./common";

export function ObjectiveDetail({
  objective: o,
  objectives,
  onClose,
  onEdit,
  onOpen,
  onSaved,
  onDirty,
  onBusy,
}: {
  objective: Objective;
  objectives: Objective[];
  onClose: () => void;
  onEdit: () => void;
  onOpen: (id: string) => void;
  onSaved: (o: Objective, close?: boolean) => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
}) {
  const action = useApiAction();
  const [check, setCheck] = useState<{
    id: string;
    value: string;
    note: string;
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    onBusy(action.busy);
    return () => onBusy(false);
  }, [onBusy, action.busy]);
  const readOnly = !!o.archived_at || o.status === "done";
  const parent = objectives.find((p) => p.id === o.parent_id);
  const children = objectives.filter(
    (c) => c.parent_id === o.id && !c.archived_at,
  );
  function start(k: KeyResult) {
    if (check && !window.confirm(tr("unsaved"))) return;
    setCheck({ id: k.id, value: String(k.current), note: "" });
    onDirty(false);
  }
  function saved(result: Objective, close = false) {
    setCheck(null);
    onDirty(false);
    onSaved(result, close);
  }
  function changeState(status: "done" | "in_progress") {
    if (check && !window.confirm(tr("unsaved"))) return;
    void action.run(
      () => okrApi.move(o, status),
      (value) => saved(value, true),
    );
  }
  return (
    <Dialog wide title={o.title} onClose={onClose} initialFocus="close">
      <div className="okr-detail">
        <div className="okr-inline">
          <span className={`okr-domain is-${o.domain}`}>{tr(o.domain)}</span>
          <span className="muted">
            {tr(o.horizon)} · {tr(o.status)}
          </span>
          {o.completed_quarter && (
            <span className="okr-achievement-tag">
              <Icon name="check" />
              {quarterLabel(o.completed_quarter)}
            </span>
          )}
        </div>
        <Progress value={o.progress} />
        {parent && (
          <p className="okr-parent">
            {tr("linked")} :{" "}
            <button
              className="okr-text-button"
              onClick={() => onOpen(parent.id)}
            >
              {parent.title}
            </button>
          </p>
        )}
        <dl className="okr-detail-summary">
          {(["why", "outcome", "first_action"] as const)
            .filter((key) => o[key])
            .map((key) => (
              <div key={key}>
                <dt>{tr(key)}</dt>
                <dd>{o[key]}</dd>
              </div>
            ))}
          {o.start_date && o.due_date && (
            <div>
              <dt>
                {tr("start_date")} → {tr("due_date")}
              </dt>
              <dd>
                {dateLabel(o.start_date)} → {dateLabel(o.due_date)}
              </dd>
            </div>
          )}
        </dl>
        {o.key_results.length > 0 && (
          <section>
            <h3>{tr("key_results")}</h3>
            <div className="okr-results-list">
              {o.key_results.map((k, i) => (
                <div className="okr-result" key={k.id}>
                  <div className="okr-inline">
                    <strong>
                      <span className="okr-result-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>{" "}
                      {k.title}
                    </strong>
                    {resultProgress(k) === 100 && <Icon name="check" />}
                  </div>
                  <Progress value={resultProgress(k)} label={k.title} />
                  <p className="muted okr-small">
                    {tr("start")} : {number(k.start)} · {tr("current")} :{" "}
                    {number(k.current)} / {number(k.target)} {k.unit}
                  </p>
                  {!readOnly && check?.id !== k.id && (
                    <button
                      className="secondary-button"
                      disabled={action.busy}
                      onClick={() => start(k)}
                    >
                      {tr("check_in")}
                    </button>
                  )}
                  {check?.id === k.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action.run(
                          () =>
                            okrApi.checkIn(
                              o,
                              k.id,
                              Number(check.value),
                              check.note,
                            ),
                          (value) => saved(value),
                        );
                      }}
                    >
                      <fieldset disabled={action.busy}>
                        <label>
                          {tr("current")}
                          <input
                            autoFocus
                            type="number"
                            required
                            step="any"
                            min={-1e12}
                            max={1e12}
                            value={check.value}
                            onChange={(e) => {
                              onDirty(true);
                              setCheck({ ...check, value: e.target.value });
                            }}
                          />
                        </label>
                        <label>
                          {tr("note")} ({tr("optional")})
                          <textarea
                            rows={2}
                            maxLength={1000}
                            value={check.note}
                            onChange={(e) => {
                              onDirty(true);
                              setCheck({ ...check, note: e.target.value });
                            }}
                          />
                        </label>
                        <div className="okr-inline">
                          <button className="primary-button" type="submit">
                            {tr("save")}
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => {
                              setCheck(null);
                              onDirty(false);
                            }}
                          >
                            {tr("cancel")}
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        {children.length > 0 && (
          <section>
            <h3>{tr("children")}</h3>
            <ul className="okr-linked-list">
              {children.map((child) => (
                <li key={child.id}>
                  <button
                    className="okr-text-button"
                    onClick={() => onOpen(child.id)}
                  >
                    {child.title}
                  </button>
                  <span>{tr(child.horizon)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ErrorMessage message={action.error} />
        {!o.archived_at && (
          <p className="okr-complete-hint">
            {o.status !== "done" &&
              tr(
                o.key_results.every((k) => resultProgress(k) === 100)
                  ? "complete_hint"
                  : "complete_pending",
              )}
          </p>
        )}
        <div className="okr-detail-actions">
          {!readOnly && (
            <>
              <button
                className="primary-button"
                disabled={
                  action.busy ||
                  o.key_results.some((k) => resultProgress(k) < 100)
                }
                onClick={() => changeState("done")}
              >
                <Icon name="check" />
                {tr("complete")}
              </button>
              <button
                className="secondary-button"
                disabled={action.busy}
                onClick={onEdit}
              >
                {tr("edit")}
              </button>
            </>
          )}
          {o.status === "done" && !o.archived_at && (
            <button
              className="secondary-button"
              disabled={action.busy}
              onClick={() => changeState("in_progress")}
            >
              <Icon name="restore" />
              {tr("reopen")}
            </button>
          )}
          <button
            className="secondary-button"
            disabled={action.busy}
            onClick={() => {
              if (check && !window.confirm(tr("unsaved"))) return;
              void action.run(
                () => okrApi.archive(o, !o.archived_at),
                (value) => saved(value, true),
              );
            }}
          >
            <Icon name={o.archived_at ? "restore" : "archive"} />
            {tr(o.archived_at ? "restore" : "archive")}
          </button>
        </div>
        <button
          className="okr-text-button"
          aria-expanded={showHistory}
          onClick={() => setShowHistory(!showHistory)}
        >
          {tr("history")} <Icon name={showHistory ? "up" : "down"} />
        </button>
        {showHistory && <History key={`${o.id}:${o.version}`} id={o.id} />}
      </div>
    </Dialog>
  );
}
const events: Record<string, MessageKey> = {
  created: "created",
  updated: "updated",
  check_in: "check_in_event",
  key_result_reached: "key_result_reached",
  moved: "moved",
  completed: "completed",
  reopened: "reopened_event",
  archived: "archived",
  restored: "restored",
};
function History({ id }: { id: string }) {
  const [offset, setOffset] = useState(0);
  const result = useApiResource(
    (signal) => okrApi.history(id, offset, signal),
    [id, offset],
  );
  return (
    <section className="okr-history">
      <LoadState {...result} />
      {result.data && (
        <>
          <ol>
            {result.data.map((e) => (
              <li key={e.id}>
                <span>{tr(events[e.kind] ?? "updated")}</span>
                <time dateTime={e.occurred_at}>{dateLabel(e.occurred_at)}</time>
                {e.detail.note && <p>{e.detail.note}</p>}
                {e.detail.key_result_id && (
                  <p className="muted">
                    {e.snapshot.key_results
                      .filter((k) => k.id === e.detail.key_result_id)
                      .map(
                        (k) =>
                          `${k.title} : ${number(k.current)} / ${number(k.target)} ${k.unit}`,
                      )}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <div className="okr-inline">
            <button
              className="secondary-button"
              disabled={!offset}
              onClick={() => setOffset(offset - 30)}
            >
              {tr("previous")}
            </button>
            <button
              className="secondary-button"
              disabled={result.data.length < 30}
              onClick={() => setOffset(offset + 30)}
            >
              {tr("next")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
