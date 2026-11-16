# Sport

Navigation shares its design with Tasks. The top bar contains the breadcrumb and mobile menu button; the global reload button and username have been removed. The footer contains the library, Sport documentation, theme, language and user/sign-out controls, including on mobile. See [shared navigation](applications.md#shared-navigation).

Enable **Sport** in the [LifeOS library](applications.md), then open it. Sport shares your session, language and appearance. Its sidebar contains programs, training, exercises, body measurements, statistics, history and settings. On mobile, **Open navigation** exposes the same destinations; focus starts on **Close navigation**, and closing the menu returns focus to its trigger.

## Default and personal exercises

The catalogue supplies **680 default exercises**, available in English and French, covering strength, bodyweight, cardio, gymnastics, carries, mobility, stretching and timed movements. Search by name, muscle or equipment, with or without accents, then filter by input type. Search uses the current language. There is nothing to import and no external account to connect.

Supplied exercises are marked **Default**. Their names, notes, aliases, muscles and equipment follow your language, including when shown inside programs and training history. Their stable identities never change.

**New exercise** creates a **Personal** exercise. **Customize** copies a default exercise into a personal one in the language currently displayed. You can edit its name, type, equipment and notes without changing the shared catalogue. Personal text is never translated automatically, even when a name matches a default exercise. Personal exercises can be archived and restored.

| Input type | Measurements per set | Examples |
| --- | --- | --- |
| Weight and repetitions | kg and reps | Bench press, squat, deadlift |
| Bodyweight / repetitions | reps | Push-ups, burpees, pull-ups |
| Assisted repetitions | assistance in kg and reps | Assisted pull-ups or dips |
| Hold / duration | seconds | Plank, wall sit, stretching |
| Distance and duration | metres and seconds | Running, cycling, swimming, rowing |
| Weight and distance | kg and metres | Farmer carry, sled, weighted walk |
| Weight and duration | kg and seconds | Farmer hold, weighted plank |
| Timed repetitions | reps and seconds | Timed burpees, skipping |
| Distance only | metres | Long jump, handstand walk |
| Machine energy and duration | displayed kcal and seconds | Air bike, rower, SkiErg |

Types describe measurements, not a closed list of sports. A movement can have variants with different input types. Calories are the machine’s displayed value; no physiological estimate is calculated. The server rejects fields that do not belong to the selected type. Enter **total weight**, including the bar and both dumbbells. For a band without measurable assistance, use repetitions and describe the resistance in notes.

## Programs and training

In **Programs**, choose **New program**, name it and add exercises. Each exercise accepts 1–30 sets; a program accepts at most 50 exercises and 300 sets. Targets per set are optional. Arrow buttons reorder entries and the remove button removes an entry from the draft.

On desktop, HYROX and regular cards all have the same height, with buttons aligned at the bottom of each row. On phones, they show the name, total exercise and set counts, the first two exercises and the number of remaining exercises. The smaller HYROX banner keeps its logo, countdown and date. The pencil button opens the full editor with notes, every set and its targets.

To archive a program, open its **edit page** and choose **Archive** at the bottom. The button does not appear on cards or during creation. If there are unsaved changes, confirmation lets you discard them before archiving; errors preserve the draft. Archiving uses the saved version and keeps exercises, notes, the competition date and history. Enable **Archived programs**, then choose **Restore** on the card to bring it back.

Creation and editing open a dedicated page. **All programs** or **Cancel** returns to the list; leaving a modified draft requires confirmation, including changing language. Browser back/forward navigation is supported. `/sport?tab=workouts&program=new` opens creation, `program=<uuid>` opens an existing program and `archived=true` preserves the return to archived programs.

**Add an exercise** opens the inline catalogue and focuses search. Choosing an exercise focuses its set count. Entries and values stay together during reordering. Limits are shown explicitly. **Save program** calls the API; network errors and conflicts leave the fields intact for correction. Drafts are temporary and are lost after confirmed reload or session expiry.

**Start training session** creates a snapshot of exercises, types and targets. Only one session can be active per account. **Resume** or **Training** returns to it. Saved programs and active sessions survive reloads and language changes.

1. Enter the result in the visible fields for each set, then choose **Complete set** or press Enter in a field. Fields and units match the exercise type. A check mark and “x / y sets” indicate progress.
2. Rest starts automatically. Set its duration in **Settings**, from 0 to 3,600 seconds; the default is 90. A changed duration applies to the next completed set.
3. The recovery timer stays at the bottom while a training session is active, including when scrolling or switching Sport tabs. It uses a server deadline and remains correct after reload or returning from the background. **Skip rest** ends it. There is no system notification or audible alarm.
4. Edit a completed set and choose **Correct set** to keep its original completion time without restarting rest. **Undo completion** removes its recorded result and stops rest while keeping the values on screen. **Discard entry** restores saved or suggested values.
5. Once every set is complete, **Finish training session** saves results, notes and score. **Cancel training session** preserves recorded sets in history but excludes the session from statistics and scoring.

The last recorded results are suggested next time, **set by set**, for the same program and exercise type. Suggestions do not complete sets and remain editable. Recorded results from cancelled sessions also count as suggestions; undone or never-completed sets do not erase earlier results. Empty sessions do not hide the last recorded values.

Matching uses exercise identity and type even after reordering. Repeated occurrences of one exercise track their own results by occurrence order. New programs or changed types start without past results. Without a historical value, the last completed preceding set in the current session is used, then the program target. Targets remain unchanged. Suggestions are fixed when training starts and survive reloads and disable/enable cycles.

Unsaved field edits remain pending until completion or correction. Errors and refresh do not erase them. Leaving asks for confirmation; confirmed reload or sign-out loses pending entries. Finish requires saving or discarding them first. After a training error, **Refresh training session** appears in the content. It retrieves server results while preserving edited fields for reconciliation after a conflict.

Finished or cancelled sessions are immutable. Editing or archiving the source program does not change them. A personal exercise must be active to start another session; if its type changed, remove and re-add it in the program to configure new targets. Obsolete versions fail explicitly instead of overwriting saved results.

## Body measurements

Add a dated record with weight, body fat, neck, shoulders, chest, waist, hips, left/right arms, thighs or calves. One value is enough. Each account can have one active record per date; future dates are rejected using the server’s UTC day. Edit to complete or correct a record. Archiving removes it from charts and is reversible. Restoration is rejected if another active record already uses that date.

## Statistics and score

**Statistics** shows completed sessions, sets, actual lifted volume (kg × reps) and total distance. Choose a period, body measurement, exercise and program baseline. Charts include an accessible data table. The horizontal axis follows observations in chronological order; spacing does not represent elapsed time. The period includes both endpoint dates, uses UTC training dates, defaults to one year and is limited to ten years.

The first completed session of a program scores **100**. Later sessions compare each exercise’s current performance with that baseline and average the ratios × 100, giving every exercise equal weight. Scores of 120 or 80 represent an average increase or decrease of 20% according to those measurements. The score does not assess health, technique or perceived difficulty.

| Type | Compared performance |
| --- | --- |
| Weight and repetitions | sum of `(weight + 1) × reps` |
| Repetitions | total reps |
| Assistance | sum of `reps / (assistance + 1)` |
| Duration | total duration |
| Distance and duration | total distance / total duration, m/s |
| Weight and distance | sum of `(weight + 1) × distance` |
| Weight and duration | sum of `(weight + 1) × duration` |
| Timed repetitions | total reps / total duration × 60 |
| Distance only | total distance |
| Energy and duration | total displayed energy / total duration × 60 |

The `+ 1` supports zero weight or assistance; these comparison points differ from actual lifted volume. Higher speed over a shorter distance may increase the cardio score, so also check distance. Longer stretching duration does not imply better health results.

Only sessions of the same program with identical exercise IDs, types, order and numbers of sets share a baseline. Changing targets preserves the comparison family; changing structure creates another. Scores and metrics are saved at completion and are not recalculated retroactively. Language changes only how default exercise names and units are presented, never results or baseline identity.

## Retention and limits

Disabling Sport keeps programs, personal exercises, sets, rest deadlines, history, settings and measurements. Enabling it restores access; elapsed rest appears finished. Archiving is reversible and no permanent deletion is offered. Records remain private to your account.

The catalogue is packaged with the application, without images, videos, coaching or external runtime requests. All business data goes through the API; there is no browser business-data store, offline mode or instant synchronization between devices. Exercise and session lists are paginated; programs and measurements load in full. A ten-year statistics request may be large for an extensive history.

The supplied catalogue is a versioned editorial selection based on common movement terminology and the public free-exercise-db nomenclature consulted on 14 November 2026. Its instruction texts and images were not imported. See the [provenance record](../sport.md#catalogue-et-provenance), [Sport API](../sport-api.md) and [backups](../sauvegardes.md), maintained in French.

## Preparing for HYROX

A program title containing **Hyrox**, regardless of case, activates the monochrome logo, track pattern and competition countdown in the program list, editor, exercise picker and active training, including the recovery bar. Black and white styling stays within cards and bounded surfaces; the page background and spaces between cards retain the usual theme. Other LifeOS controls remain the same.

**Date of your next HYROX** is optional. Before the date the banner shows **D−…**, on the date **RACE DAY**, and afterwards **AFTER THE RACE**. Without a date it shows **ON THE WAY**. Use **Clear competition date** and save to remove it. Past dates are accepted. The countdown compares civil dates in your browser’s timezone, refreshes every 30 seconds and when the tab returns to the foreground, and has no alarm.

Removing “Hyrox” from the title hides the branding but preserves the date. A session snapshots its name and competition date when it starts; later program edits do not change an active or historical session. Archiving, language changes and disabling/re-enabling Sport preserve dates. The logo is packaged locally; it does not indicate an official partnership. See the [provenance record](../sport.md#preparer-un-hyrox).
