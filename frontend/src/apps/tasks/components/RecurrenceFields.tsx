import { formatLocale } from "../../../shared/i18n";
import { tr } from "../i18n";
import { useState } from "react";
import { dayCodes, months, plusDays, weekdays } from "../scheduling";
import { localDate, type Recurrence } from "../types";
import { Icon } from "../../../shared/ui/Icon";

export function RecurrenceFields({
  rule,
  onChange,
}: {
  rule: Recurrence;
  onChange: (rule: Recurrence) => void;
}) {
  const parts: Record<string, string> = Object.fromEntries(
    rule.rrule.split(";").map((part) => part.split("=")),
  );
  const anchor = rule.start_date || localDate();
  const frequency = parts.FREQ || "WEEKLY";
  const ordinal = parts.BYDAY?.match(/^(-?\d+)(MO|TU|WE|TH|FR|SA|SU)$/);
  const [advanced, setAdvanced] = useState(
    !!(
      parts.BYYEARDAY ||
      parts.BYWEEKNO ||
      parts.WKST ||
      (ordinal &&
        !["1", "2", "3", "4", "5", "-1", "-2"].includes(ordinal[1])) ||
      (frequency === "YEARLY" &&
        !parts.BYMONTH &&
        (parts.BYDAY || parts.BYMONTHDAY)) ||
      (frequency !== "YEARLY" && parts.BYMONTH) ||
      (frequency === "DAILY" &&
        (parts.BYDAY || parts.BYMONTHDAY || parts.BYSETPOS)) ||
      (frequency === "WEEKLY" && parts.BYSETPOS) ||
      (parts.BYSETPOS &&
        !["1", "2", "3", "4", "5", "-1", "-2"].includes(parts.BYSETPOS)) ||
      (["MONTHLY", "YEARLY"].includes(frequency) &&
        parts.BYDAY &&
        !ordinal &&
        !(
          parts.BYSETPOS && ["MO,TU,WE,TH,FR", "SA,SU"].includes(parts.BYDAY)
        )) ||
      (parts.BYDAY && parts.BYMONTHDAY)
    ),
  );
  const [exclude, setExclude] = useState("");
  const monthlyMode = ordinal || parts.BYSETPOS ? "weekday" : "date";
  const endMode =
    rule.end_date !== null
      ? "date"
      : rule.max_occurrences !== null
        ? "count"
        : "never";
  const set = (patch: Partial<Recurrence>) => onChange({ ...rule, ...patch });
  function editParts(patch: Record<string, string | undefined>, reset = false) {
    const next = { ...(reset ? {} : parts), ...patch };
    // YEARLY + BYMONTHDAY/BYDAY otherwise expands across the whole year.
    // Persist the month visibly selected by the builder, including its default.
    if (rule.mode === "scheduled" && next.FREQ === "YEARLY" && !next.BYMONTH)
      next.BYMONTH = String(Number(anchor.slice(5, 7)));
    set({
      rrule: Object.entries(next)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${value}`)
        .join(";"),
    });
  }
  function toggleDay(code: string) {
    const selected = new Set(
      (
        parts.BYDAY ||
        dayCodes[(new Date(`${anchor}T12:00:00`).getDay() + 6) % 7]
      ).split(","),
    );
    if (selected.has(code)) {
      if (selected.size === 1) return;
      selected.delete(code);
    } else selected.add(code);
    editParts({ BYDAY: dayCodes.filter((d) => selected.has(d)).join(",") });
  }
  function ordinalRule(position: string, day: string) {
    editParts({
      BYMONTHDAY: undefined,
      BYDAY: day.includes(",") ? day : `${position}${day}`,
      BYSETPOS: day.includes(",") ? position : undefined,
    });
  }
  return (
    <div className="recurrence-fields">
      <div
        className="recurrence-mode"
        role="group"
        aria-label={tr("recurrence_calculation")}
      >
        <button
          type="button"
          aria-pressed={rule.mode === "scheduled"}
          onClick={() => set({ mode: "scheduled" })}
        >
          <strong>{tr("fixed_schedule")}</strong>
          <span>{tr("for_example_every_monday")}</span>
        </button>
        <button
          type="button"
          aria-pressed={rule.mode === "completion"}
          onClick={() =>
            set({
              mode: "completion",
              rrule: `FREQ=${frequency};INTERVAL=${parts.INTERVAL || 1}`,
            })
          }
        >
          <strong>{tr("after_completion")}</strong>
          <span>{tr("the_interval_restarts_when_done")}</span>
        </button>
      </div>
      {!advanced && (
        <>
          <div className="recurrence-interval">
            <label>
              {tr("repeat_every")}
              <input
                type="number"
                min={1}
                max={1000}
                value={parts.INTERVAL || 1}
                onChange={(e) => editParts({ INTERVAL: e.target.value || "0" })}
              />
            </label>
            <label>
              {tr("unit")}
              <select
                value={frequency}
                onChange={(e) =>
                  editParts(
                    { FREQ: e.target.value, INTERVAL: parts.INTERVAL || "1" },
                    true,
                  )
                }
              >
                <option value="DAILY">{tr("days")}</option>
                <option value="WEEKLY">{tr("weeks")}</option>
                <option value="MONTHLY">{tr("months")}</option>
                <option value="YEARLY">{tr("years")}</option>
              </select>
            </label>
          </div>
          {frequency === "WEEKLY" && rule.mode === "scheduled" && (
            <fieldset className="schedule-fieldset">
              <legend>{tr("on_these_days")}</legend>
              <div className="weekday-picker">
                {dayCodes.map((day, i) => (
                  <button
                    type="button"
                    key={day}
                    aria-label={weekdays()[i]}
                    aria-pressed={(
                      parts.BYDAY ||
                      dayCodes[
                        (new Date(`${anchor}T12:00:00`).getDay() + 6) % 7
                      ]
                    )
                      .split(",")
                      .includes(day)}
                    onClick={() => toggleDay(day)}
                  >
                    {
                      [
                        tr("mo"),
                        tr("tu"),
                        tr("we"),
                        tr("th"),
                        tr("fr"),
                        tr("sa"),
                        tr("su"),
                      ][i]
                    }
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {frequency === "YEARLY" && rule.mode === "scheduled" && (
            <fieldset className="schedule-fieldset">
              <legend>{tr("in_these_months")}</legend>
              <div className="month-picker">
                {months().map((month, i) => (
                  <button
                    type="button"
                    key={month}
                    aria-pressed={(
                      parts.BYMONTH || String(Number(anchor.slice(5, 7)))
                    )
                      .split(",")
                      .includes(String(i + 1))}
                    onClick={() => {
                      const selected = new Set(
                        (
                          parts.BYMONTH || String(Number(anchor.slice(5, 7)))
                        ).split(","),
                      );
                      if (selected.has(String(i + 1))) {
                        if (selected.size === 1) return;
                        selected.delete(String(i + 1));
                      } else selected.add(String(i + 1));
                      editParts({
                        BYMONTH: [...selected]
                          .sort((a, b) => +a - +b)
                          .join(","),
                      });
                    }}
                  >
                    {month.slice(0, 3)}.
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {["MONTHLY", "YEARLY"].includes(frequency) &&
            rule.mode === "scheduled" && (
              <>
                <label>
                  {tr("which_day")}
                  <select
                    value={monthlyMode}
                    onChange={(e) =>
                      e.target.value === "date"
                        ? editParts({
                            BYMONTHDAY: String(Number(anchor.slice(8))),
                            BYDAY: undefined,
                            BYSETPOS: undefined,
                          })
                        : ordinalRule("1", "MO")
                    }
                  >
                    <option value="date">
                      {tr("one_or_more_days_of_the_month")}
                    </option>
                    <option value="weekday">
                      {tr("a_weekday_in_the_month")}
                    </option>
                  </select>
                </label>
                {monthlyMode === "date" ? (
                  <label>
                    {tr("days_of_the_month")}
                    <input
                      value={
                        parts.BYMONTHDAY ?? String(Number(anchor.slice(8)))
                      }
                      placeholder="1, 15, -1"
                      onChange={(e) =>
                        editParts({
                          BYMONTHDAY: e.target.value.replaceAll(" ", ""),
                        })
                      }
                    />
                    <span className="field-help">
                      {tr("separate_with_commas_1_last_day_2_second_to_last")}
                    </span>
                  </label>
                ) : (
                  <div className="form-grid">
                    <label>
                      {tr("position")}
                      <select
                        value={ordinal?.[1] || parts.BYSETPOS || "1"}
                        onChange={(e) =>
                          ordinalRule(
                            e.target.value,
                            ordinal?.[2] || parts.BYDAY || "MO",
                          )
                        }
                      >
                        <option value="1">{tr("first")}</option>
                        <option value="2">{tr("second")}</option>
                        <option value="3">{tr("third")}</option>
                        <option value="4">{tr("fourth")}</option>
                        <option value="5">{tr("fifth")}</option>
                        <option value="-1">{tr("last")}</option>
                        <option value="-2">{tr("second_to_last")}</option>
                      </select>
                    </label>
                    <label>
                      {tr("day")}
                      <select
                        value={ordinal?.[2] || parts.BYDAY || "MO"}
                        onChange={(e) =>
                          ordinalRule(
                            ordinal?.[1] || parts.BYSETPOS || "1",
                            e.target.value,
                          )
                        }
                      >
                        {dayCodes.map((d, i) => (
                          <option key={d} value={d}>
                            {weekdays()[i]}
                          </option>
                        ))}
                        <option value="MO,TU,WE,TH,FR">
                          {tr("business_day_mon_fri")}
                        </option>
                        <option value="SA,SU">{tr("weekend_day")}</option>
                      </select>
                    </label>
                  </div>
                )}
              </>
            )}
        </>
      )}
      <div className="form-grid">
        <label>
          {tr("starting_on")}
          <input
            type="date"
            value={rule.start_date}
            required
            onChange={(e) => set({ start_date: e.target.value })}
          />
        </label>
        <label>
          {tr("recurrence_end")}
          <select
            value={endMode}
            onChange={(e) =>
              set({
                end_date:
                  e.target.value === "date" ? plusDays(anchor, 30) : null,
                max_occurrences: e.target.value === "count" ? 10 : null,
              })
            }
          >
            <option value="never">{tr("never")}</option>
            <option value="date">{tr("on_a_date")}</option>
            <option value="count">{tr("after_a_number_of_occurrences")}</option>
          </select>
        </label>
        {endMode === "date" && (
          <label>
            {tr("until_inclusive")}
            <input
              type="date"
              min={rule.start_date}
              value={rule.end_date || ""}
              required
              onChange={(e) => set({ end_date: e.target.value })}
            />
          </label>
        )}
        {endMode === "count" && (
          <label>
            {tr("number_of_occurrences")}
            <input
              type="number"
              min={1}
              max={10000}
              value={rule.max_occurrences || ""}
              required
              onChange={(e) => set({ max_occurrences: Number(e.target.value) })}
            />
            <span className="field-help">
              {tr(
                "includes_the_first_occurrence_skipped_overdue_dates_do_not_count",
              )}
            </span>
          </label>
        )}
      </div>
      <details className="schedule-options">
        <summary>{tr("exceptions_and_advanced_settings")}</summary>
        <div className="exception-add">
          <label>
            {tr("exclude_a_date")}
            <input
              type="date"
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={!exclude}
            onClick={() => {
              set({
                excluded_dates: [
                  ...new Set([...rule.excluded_dates, exclude]),
                ].sort(),
              });
              setExclude("");
            }}
          >
            {tr("exclude")}
          </button>
        </div>
        {rule.excluded_dates.length > 0 && (
          <ul className="exception-list">
            {rule.excluded_dates.map((day) => (
              <li key={day}>
                {new Date(`${day}T12:00:00`).toLocaleDateString(formatLocale())}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={tr("reinclude_date", { date: day })}
                  onClick={() =>
                    set({
                      excluded_dates: rule.excluded_dates.filter(
                        (d) => d !== day,
                      ),
                    })
                  }
                >
                  <Icon name="x" size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label>
          {tr("time_zone")}
          <input
            value={rule.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            placeholder="Europe/Paris"
          />
          <span className="field-help">
            {tr("determines_the_completion_day_even_when_travelling")}
          </span>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={advanced}
            onChange={(e) => setAdvanced(e.target.checked)}
          />
          {tr("edit_an_advanced_calendar_rule")}
        </label>
        {advanced && (
          <label>
            {tr("rrule_rule")}
            <input
              value={rule.rrule}
              onChange={(e) => set({ rrule: e.target.value.toUpperCase() })}
              spellCheck={false}
              placeholder="FREQ=YEARLY;BYWEEKNO=2;BYDAY=MO"
            />
            <span className="field-help">
              {tr(
                "frequency_interval_days_months_positions_weeks_or_days_of_the",
              )}
            </span>
          </label>
        )}
      </details>
    </div>
  );
}
