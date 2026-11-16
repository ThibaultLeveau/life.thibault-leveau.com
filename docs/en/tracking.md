# Tracking: habits and goals

[Guide français](../tracking.md)

Enable **Tracking** in the library, then open `/tracking`. It shares Sport’s navigation, account, language and appearance. It starts disabled; disabling preserves definitions, entries, settings and history.

## Build a tracker

Choose **My trackers → Create a tracker**, a first day, a time zone and a daily, weekly, monthly or yearly frequency. Weeks start on Monday; months and years use calendar boundaries. An IANA time zone such as `Europe/Paris` handles daylight saving changes. App settings define the dashboard’s day and the default time zone of new trackers.

Add up to 30 fields: numbers with units, Yes/No, durations (hours/minutes, stored as minutes), scales, 2–20 choices, or notes up to 4,000 characters. Fields may be optional. For daily trackers, select weekdays independently for each field. Other frequencies ask for one entry per period. A day with no scheduled field is a rest day.

Goals support at least, at most, between two bounds and exactly. The distance that scores zero controls the gradient; the weight controls each goal’s contribution. For example, at least 2 litres with a zero-score distance of 2 gives 0/10 at zero, 5/10 at one litre and 10/10 at two or more. Boolean and choice goals score either zero or ten. Notes have no goal.

## Connect applications

Choose **From an application**, an enabled source and a searchable metric. Select the tracker’s period, or the day, week, month or year containing the selected entry date. Add supported filters, search their options and calculate a preview.

Examples include completed tasks in a workspace this week, tasks completed late, manual due-date changes for tasks changed more than three times within the selected period and filters, completed training for a program, sets of an exercise, distance, volume and body measurements. All source references belong to your account.

Current-state metrics, such as currently open tasks, cannot reconstruct past states. Missing measurements and unavailable sources remain distinct from zero. Activity statistics use recorded business actions and results; screen time, page visits and page usage duration are not collected. See the [metric catalogue](../integrations.md) for calculation details.

## Enter and correct values

**Today** groups current daily, weekly, monthly and yearly periods. **Start** opens a guided entry. Save each step or save and close to resume later. Finishing requires all mandatory values and at least one answer. Zero and No are valid answers.

Automatic values are calculated on the server when first saved. Saved entries retain their source query, calculation time and value. Later changes in Tasks or Sport do not silently rewrite them. Enable **Refresh automatic values** to recalculate on the next save; this creates a history revision. A disabled source blocks new reads but preserves existing snapshots. An unavailable required value prevents completion; existing saved values remain readable without refreshing.

Errors preserve your input. Concurrent edits return a conflict: reload and apply your correction. The interface warns before leaving changed forms. Unsaved forms are temporary; business data is never stored in browser storage. Sign-out and session expiry remove private views.

## Calendar, statistics and rewards

The month grid shows goal scores from red through amber to green, independently of the completion check and completed-tracker count. **A fully entered day may score 0/10.** Dashed days have no entry; partial days, rest days and future days have distinct states. Select a day to view or amend entries; arrow keys and Home/End navigate the grid. The year view shows twelve mini-calendars. On mobile, day details appear below the grid. Archived trackers remain available in the filter.

Longer periods have a separate section and do not colour every day as complete. Daily scores combine the goals scheduled for that day. With no scored answer, the score is unknown. Missing required answers contribute a provisional zero; optional unanswered goals are excluded. Ten is reserved for goals actually achieved.

Statistics show numeric/boolean trends and a data table, with an average across scored entries and a completion rate across all four frequencies. The selected period includes unfinished current periods. You can explore a Tasks or Sport activity metric for the same date range.

Each complete period earns 10 XP plus up to 20 XP for its goal score. Every 250 XP adds a level. Five badges reward the first, seventh, thirtieth, hundredth and tenth perfect period. Corrections recalculate points rather than duplicating rewards. Daily streaks and the best streak use the last 366 days, skip rest days and allow the current unfinished day to finish.

## Lifecycle and limits

Existing entries keep their original goals and definition. Edits apply to new periods, no earlier than the local edit date; an already-started longer period keeps its earlier definition. Frequency, first day and time zone are fixed after creation. Changing a field’s type or unit starts a separate measurement series.

Archive removes a tracker from current entry lists and preserves history. Restore it from Archives. Past calendar periods and started longer periods remain; new periods follow archive/restore dates. Reorder active trackers with Up/Down. Up to 50 trackers may be active. Permanent deletion is not offered.

The calendar and trends allow up to 367 days per request. Queries and entry histories used for calculation are bounded at 20,000 records. All persistent operations have a [versioned API](../tracking-api.md). PostgreSQL backups contain definitions, values, source snapshots and immutable revision histories; see [backup procedures](../sauvegardes.md#migration-0009-suivi).
