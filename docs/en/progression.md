# Achievements and progress in each application

[Guide français](../progression.md)

Tasks, Sport, Tracking, OKR Goals and Recipes each have their own XP, level, title and streak. Open the badge at the top right to see your progress and the three unfinished quests closest to completion. Enter opens the panel; Escape closes it and returns focus.

In **Tracking → Achievements**, choose an enabled application to explore its **60 quests**, filter completed or unfinished quests, search objectives and browse the points journal. The title journey shows all ten milestones. Disabling an application preserves its progress; Tasks and Sport still work when Tracking is disabled.

## Points, levels and titles

| Application | First confirmed action | Reward |
| --- | --- | --- |
| Tasks | Complete a task or a distinct recurring occurrence | 10 XP |
| Tracking | Confirm a tracking period | 20 XP + 0–20 XP for its goal score |
| Sport | Finish a session with at least one performed set containing a positive value | 60 XP + 5 XP per performed set, up to 100 bonus XP |

The base coefficients **1 / 2 / 6** reflect a frequent action, a structured check-in and a more demanding session. Tracking adds twice the score out of ten, rounded to an integer; no goal means no bonus. Empty or cancelled sessions, browsing, refreshing, editing and archiving award no XP.

**Earned rewards are kept.** Reopening a task, undoing completion or correcting a tracking entry neither removes points nor awards them again. Quest facts are captured at first confirmation. A later correction can improve a tracker’s statistical score without rewriting the journal. Recurring tasks are unique by task and occurrence due date; other actions are unique by task, period or session. This personal motivation system does not detect deliberately fictitious entries.

Levels start at 1 and stop at **100**. Moving from level L to L+1 costs **100 + 25 × (L−1) XP**. Level 100 requires **131,175 XP**; the journal keeps recording points afterwards. Every ten levels unlocks an application-specific title automatically. The starting title is “Newcomer”.

Each application has six families of ten quests: Tasks rewards completions, on-time work, recurring occurrences, priorities 1/2, active days and streaks; Sport rewards sessions, sets, different exercises, different programs, active days and streaks; Tracking rewards confirmed periods, perfect scores, met goals, different trackers, active days and streaks. Each family’s ten milestones award **25, 40, 60, 90, 130, 180, 250, 350, 500 and 750 XP**, once each. Streak quests require **3, 7, 14, 21, 30, 45, 60, 90, 180 and 365 eligible days**. Quests unlock after an eligible action; changing settings alone awards no points.

## Rest days and vacation

In [General settings](settings.md), choose **General** for the IANA timezone of new activities and shared vacation periods. Open each application’s section to choose its expected weekdays (at least one day). Starting vacation today proposes one editable week. Save to apply it. Up to 100 non-overlapping periods are supported. Ending vacation today closes the interval yesterday so today becomes eligible again.

For weekly tracking, select Sunday only; for three days of practice, select Monday, Wednesday and Friday. “Every day” and “Monday to Friday” provide shortcuts. The badge displays the scheduled days. Existing preferences remain unchanged: all days, or Monday–Friday if weekends were excluded. Three successful Sundays count as three streak days. A Saturday confirmation does not replace a missed Sunday: these are fixed weekdays, not a flexible weekly quota. Tracker deadlines remain unchanged; this setting only affects the application’s usage streak.

One first confirmation validates an application’s day; more actions do not add extra streak days. Backdated tracking entries count on the day you confirm them. Rest and vacation days neither increment nor break a streak, even if you use an application; activities still earn XP and count as days of practice. Today remains open until its end. A past eligible day without activity breaks the current streak. The best streak uses all recorded history.

Changing timezone does not move previously recorded activity dates. Selected weekdays and vacation rules recalculate historical streaks without rewriting rewards. Disabling an application preserves its data but does not pause its calendar. Unsaved settings are protected during navigation, language changes and sign-out, and concurrent changes return a conflict.

## Existing data

An explicit import for a named account can recover verifiable historical activity. Existing Tracking periods retain their former 10–30 XP; new confirmations use the new scale. Imported activities keep their original date; newly unlocked quests use the import date. Missing historical task priorities are not inferred. Repeating an import never duplicates rewards.

All features use the [versioned progression API](../api.md#progression-par-application). The older `/tracking/achievements` remains a compatible historical calculation of current tracking entries and five badges. The new wall, titles and shared badge use `/progression`, whose rewards remain earned after corrections.

## OKR quests

OKR adds 60 quests across completed objectives, key results reached, personal goals, professional goals, active days and streaks. First completion earns 100 XP per objective; first attainment earns 15 XP per key result within an objective. Corrections and reopening keep rewards without duplicating them. Snapshot areas are fixed at first success. The badge works without Tracking. [OKR details](okr.md#tracking-and-quests).

## Recipes quests

Recipes adds 60 quests across saved recipes, completed lists, distinct list/recipe imports, non-empty templates, active days and streaks. First confirmations earn 25, 50, 5 and 15 base XP respectively. This application also rewards building your recipe book and reusable templates. Stable identifiers prevent repeated rewards for edits, rechecking, reopening or re-enabling. [Details](recipes.md#tracking-and-rewards). There are now 300 quests across five applications.

Preferences are grouped in [General settings](settings.md). An application’s Settings control opens its section; the progression timezone and vacations are under General, and usage days are in each application section.
