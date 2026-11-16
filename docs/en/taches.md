# Using Tasks

Tasks is enabled by default in LifeOS. Open it from Home or enable it again in the [library](applications.md). Disabling Tasks blocks access without changing your records or history.

## Immediate interactions

Checking a task shows a short confirmation animation immediately. You can check another task without waiting. Creation, editing, moving, duplication, archiving/restoring, bulk actions and settings also update immediately while saving in the background. Lists, the board and **Upcoming** remain available; the status above the view shows pending saves.

The server supplies the next date of a recurring task. Natural-language dates still require validation before submission. Confirmation dialogs and form validation remain in place.

If a save fails, a visible message explains the problem and the view is reconciled with saved data. Independent actions continue. **Resume editing** recovers a task draft, including after switching views. Review current values after a conflict. Following a connection failure, reload to check whether the action was saved before submitting it again.

Wait for pending saves before closing or reloading the page. The browser warns when leaving with pending writes; drafts and pending actions are not stored offline. The animation follows the system’s reduced-motion preference.

## Workspaces and hierarchy

Choose **New workspace** to create a personal space, work area or project. Give it a name, description, colour and optional parent workspace. New workspaces receive **To do**, **In progress** and **Done** statuses when your account language is English. Existing status names remain unchanged when you switch languages, because they are editable personal content.

Workspace settings let you edit its name, parent, sections, statuses and labels. Selecting no parent moves it to the root. Descendants move with their parent, but tasks keep their original workspace, dates and history. Cycles are rejected. Each workspace owns its own tasks and settings; opening a parent does not combine its descendants’ tasks. The full path appears in navigation and workspace choices. Reorder workspaces within the same parent using the arrow controls.

Sections organize tasks inside a workspace and can appear in lists, boards or both. Statuses determine whether a task is open or complete. At least one open and one completed status must remain; a status used by tasks, including archived tasks, cannot change its completion meaning. Labels belong to their workspace.

## Upcoming tasks

**Upcoming** combines due tasks from active workspaces and is the default `/tasks` view. A link with `?space=…` still opens that workspace. Tasks are grouped chronologically by date with their full workspace path and section.

Choose the period and whether to include overdue or completed tasks. Custom horizons range from 1 to 90 days. These settings are saved to your account. Tasks without a due date remain in their workspace and do not appear in the agenda. Dates use the browser’s local day, including after midnight or when returning to an open tab.

## Create and organize tasks

Use **New task** or quick entry. Enter a title, optional description, status, section, priority, labels and due date. Saved data comes from the server; closing or reloading a form can lose unsaved entries. A version conflict is explicit and does not silently overwrite another device’s change.

List, board and other available task views share the same records and actions. View preferences such as grouping, sorting, visible completed tasks and filters persist through the API. Search waits briefly while you type. An update preserves the visible list and scroll position; errors keep the last results and offer **Try again**.

Drag handles move individual tasks where supported. The accessible move command offers a keyboard alternative and also moves tasks between workspaces. Select several tasks for rescheduling, moving or reversible deletion. The context menu supports duplication and individual actions. Use Escape to dismiss menus or clear selection. A touch hold starts selection; moving before activation continues scrolling. A task keeps its identity and history when moved.

Marking a task complete records its completion time. Reopening preserves the earlier completion event. Archiving is reversible and does not erase task history. Archived workspaces and sections must be restored before their content can be active again; active child workspaces prevent archiving a parent. There is no permanent deletion operation in this release.

## Dates and natural-language recurrence

Recognition follows the account language. With English selected, type a date or recurrence alongside your title, then check the preview before saving:

| Example | Meaning |
| --- | --- |
| `Read tomorrow` | One due date |
| `Read in twenty-one days` | A relative date |
| `Review on January 21, 2027` | A named calendar date |
| `Run every Monday and Thursday` | Selected weekdays |
| `Read every two days` | A regular interval |
| `Run every Wednesday every three weeks` | A cadence combined with a weekday |
| `Check every other week on Monday through Friday` | A weekday range and interval |
| `Pay every 1st and 21st of the month` | Several days of the month |
| `Review every last business day of the month` | A monthly position |
| `Read every day for five times except tomorrow` | A count limit and exclusion |

Numbers and ordinals can be written as words or digits. Numeric dates use **day/month/year**, including in English; `YYYY-MM-DD` is accepted. A calendar day is not an instant or a time of day. Unsupported combinations, incomplete expressions, hours and public-holiday rules are not silently applied: read the diagnostic and correct the expression or explicitly keep it as literal text.

The recognition preview shows the interpreted words, a description and upcoming dates. Only a recognized expression is removed from the title. To keep words such as “tomorrow” in a title, use the literal-text action or put them in quotation marks. Existing saved titles are never translated or reinterpreted merely because the language changes.

The date picker also offers a calendar and custom recurrence controls. Choose a frequency and interval, selected days or monthly positions, an anchor, optional end date or occurrence limit and excluded dates. The preview uses the same server rules as saving and completion. The timezone is stored with the rule. An impossible rule is rejected rather than saved with an invalid next date.

## Completing recurring tasks

Completing a recurring task records the completion and schedules its next occurrence in one transaction. The same task keeps its ID, rule, history and completed-occurrence count. The next occurrence uses the rule’s scheduled or completion-based calculation mode. An end date or occurrence limit eventually ends the series.

The completion notice offers an undo action. Undo records a compensating event and restores the relevant occurrence; it does not erase history. Editing the recurrence definition restarts its occurrence counter while preserving earlier events. Moving or archiving a recurring task does not reset its dates or history. A language change does not modify any recurrence, anchor, timezone, count or event.

## Accessibility, privacy and limits

The interface supports keyboard navigation, named controls, focus-contained dialogs and narrow screens in light and dark themes. The board scrolls inside its own region. Your browser can still zoom manually. Menus and dialogs close with Escape and restore focus to their trigger where applicable.

All records belong to the signed-in account. Writes require the session, CSRF token and allowed origin. There is no offline business-data store or instant synchronization between devices. A session expiry removes private views; records already saved remain intact. Task-resolution statistics and OKRs are future work.

See [language preferences](index.md), the [French detailed task guide](../taches.md) and the [API reference](../api.md).
