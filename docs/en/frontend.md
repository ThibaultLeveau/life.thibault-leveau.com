# Frontend

React, TypeScript and Vite retain the existing toolchain. `App.tsx` assembles shared login, Home `/`, the `/applications` library and registered Pages without another router or general fallback. Without a workspace, `/tasks` opens the global agenda (`?view=agenda`). `?space=<UUID>` identifies an active workspace; server authorization remains authoritative.

## Assistant message formatting

`platform/assistant/components/MessageText.tsx` renders paragraphs, bold text, inline/fenced code and pipe tables using React text nodes. Header and separator column counts must match; outer pipes are optional, `\|` escapes a pipe, and colons control alignment. Missing row cells are padded; rows with surplus cells stay literal to avoid hiding content. Lines without a pipe end a table. Fences (including unfinished ones) keep table examples as code. This is a bounded formatter, not a complete Markdown engine; it never injects HTML or loads message images/links.

Tables use semantic column headers and a focusable, localized scrolling region with existing theme tokens. The original API `content` stays unchanged in PostgreSQL: streaming and history use the same renderer, with no new setting, dependency, migration or backup procedure. `assistant.spec.ts` covers rendering, malformed input, SSE chunks, security, FR/EN themes, keyboard scrolling and 320 px layout.

## Shared application navigation {#navigation-commune-des-applications}

Tasks, Sport, Tracking, OKR and Recipes compose `ApplicationSidebar` and `ApplicationTopbar` from `shared/ui/ApplicationNavigation.tsx`. `shared/styles/navigation.css` owns styling: 252 px desktop sidebar, 66 px top bar (64 px mobile), identical links and visual states. Applications supply name, icon, breadcrumb and business links without overriding the frame.

`platform/auth/ApplicationFooter` orders library, localized current documentation, theme, language and account/sign-out through `AccountMenu`. Preferences stay in the shared API; Sport draft guards and waiting for pending Tasks writes are preserved. Workspace archives remain business links. The top bar has no first name or global reload; recovery commands stay in affected content.

At 800 px and below, one sliding sidebar replaces desktop navigation. It acts as a modal dialog, makes the background inert, focuses Close and confines Tab/Shift+Tab. Escape or the backdrop closes it. Focus returns to the trigger unless an action already moved it into content/a dialog. Switching to desktop releases inertness and scroll locking. Controls have at least 44 px targets; animations respect reduced motion.

## Tasks module {#module-taches}

`SchedulePicker` combines accessible `ScheduleCalendar` and `RecurrenceFields` within the dialog. `useScheduleRecognition` calls `/scheduling/parse` after 180 ms idle; earlier requests are cancelled and only responses matching current text/date are shown. Saving waits for the latest parse, including immediate submission. `ScheduleRecognition` shows detected text and offers literal preservation. Editor and quick-add share this behavior.

Rules/dates remain API data. Planner drafts apply only after a date selection or confirmed server preview. Errors preserve input; Escape closes the planner before its containing dialog. No task content goes to localStorage.

Detection shows the label and first three server-provided dates. `status=incomplete/invalid` shows `diagnostic` and requires correction or explicit **Keep text** before saving, including immediate/quick-add submission. The planner shows the same diagnostic. `ScheduleHelp` supplies account-language examples; its buttons only populate a draft to interpret. Help sits outside the live region to avoid rereading on each keystroke.

Desktop quick-add keeps its input mounted/focused after Enter. During date validation it becomes read-only, keeping focus without changing the submitted title. Success clears it; validation failure retains text. Later network confirmations do not alter the next input.

| File/component | Role |
| --- | --- |
| `Page.tsx` | Workspaces, loading, filters, business composition and platform session |
| `api.ts` | Business pagination; shared transport/CSRF in `platform/api.ts` |
| `useTaskSync.tsx`, `optimistic.ts` | Transient intentions, immediate rendering, ordered writes, versions, reconciliation/errors |
| `types.ts`, `dates.ts` | Contracts, calendar labels and local day changes |
| `AgendaView` | Cross-workspace due dates, periods and API-saved preferences |
| `TaskContents` | Content/due dates shared across list, board and agenda |
| `TaskViews` | Lists, board rows/columns, quick-add and drop targets |
| `TaskDragProvider` | Shared dnd-kit context for tasks/workspace links, pointer/keyboard sensors and preview |
| `TaskActions`, `TaskMenu`, `BulkTaskDialog` | Shared menu, transient selection, confirmation and bulk API actions |
| `useTaskSelection` | Mouse rectangle, edge scrolling and touch hold cancelled by scrolling |
| `TaskEditor`, `MoveDialog` | Atomic edits, conflicts, history and accessible movement |
| `WorkspaceSettings`, `WorkspaceDialog` | Properties, ordering, sections, columns, labels and archives |
| `shared/ui/Dialog`, `platform/auth/LoginPanel` | Shared dialog and sign-in |
| `styles.css` | Business presentation using shared tokens |

`@dnd-kit/core` provides pointer/keyboard sensors and drop targets. The server computes final order. Cells use `POST /tasks/{id}/move`; another-workspace drops use `/tasks/bulk` with one task and `section_id: null` to preserve open/completed status. Pointers must hit a real target; proximity is keyboard-only. Automatic sorting disables grips, while the movement command remains. Section visibility determines rows; statuses determine columns.

While Tasks is mounted, `useTaskSync` retains an API-confirmed snapshot and pending intentions. `optimistic` immediately renders creation, edits, completion, moves, archive/restore, ordering and settings. Lists/agenda stay mounted during saves. Completion animation lasts 420 ms and is removed for reduced motion.

Writes run in order. Responses replace provisional values, including creation identifiers and server-only recurrence dates. Actions on newly created tasks wait for their server identifiers in the background. Versions from our writes feed subsequent actions; external conflicts remain errors without automatic retry. Moves/structural changes reread indirectly affected data before the next write.

Views load pages of 200 tasks for immediate filtering/sorting within API limits. Visited workspace metadata stays mounted; initial loads/reconciliation read at most two workspaces concurrently. Search retains a 300 ms debounce; preferences use existing APIs. A read started before a new intention cannot erase it.

Errors remove the failed provisional effect and cancel only dependent intentions. Independent actions continue. The page retains the message after a dialog closes; **Resume input** restores a task draft without sending it. Recheck current values after conflicts. If a write’s response was lost, reload to verify its outcome before repeating it.

A discreet status shows pending saves and last confirmed success. Native warnings cover closing/reloading during pending writes. Account changes wait for completion. Sign-out, expiry or disabling unmount private data and cancel remaining requests/intentions. No browser storage, worker, service, dependency or migration is added.

## Themes and accessibility {#themes-et-accessibilite}

Home tokens stay in `styles/tokens.css`. Shared `--ui-*` tokens live at root in `shared/styles/ui.css`, with explicit `data-theme=light/dark` and system media variants. This avoids partial compiled-CSS transformation of `light-dark()`. API account preferences determine theme; localStorage contains no secret or business data.

Inter is served locally. Decorative SVG icons have accessible button names. Native dialogs trap focus, close with Escape, initially focus the first field and restore the trigger. Tabs support arrows/Home/End. Every task offers a movement command without dragging.

Navigation collapses at the mobile breakpoint. Boards scroll horizontally within their region; pages/dialogs work at 320 px. Errors/successes use accessible announcements. Empty views contain no fake demo tasks.

`--ui-input-size` makes fields 16 px below 800 px or for coarse pointers, including specific settings selectors. Desktop sizes stay unchanged. The viewport always permits intentional zoom.

`shared/ui/useMobileFormViewport`, mounted once by the shell, adapts touch-screen height using `visualViewport.height`/`offsetTop`. Tasks/dialogs consume CSS measurements, falling back to window height. Focus/input track field visibility after resize, viewport movement and late native dialog scrolling. Long dialogs adjust only their `scrollTop` between header/actions, without scrolling the page, including later sections and settings additions.

Touch scrolling, wheel input or pressing elsewhere suspends tracking until the next input/focus. Tapping an already focused field can reopen the keyboard. Manual zoom suspends adaptation. Unmount removes listeners/CSS properties. This is not universal keyboard detection: browsers/floating keyboards exposing no visible-area change retain native behavior. See [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).

## Contracts and limits {#contrats-et-limites}

Private data comes only from the API. Stale `expected_version` produces an explicit error; **Resume input** retains the draft and API reconciliation refreshes data. Mutation retry never silently substitutes a newer version. Sign-out/expiry removes visible session data.

Edits send only changed fields: a pending completion can advance recurrence without a title edit restoring the previous date. The animation keeps the click target stationary (animated halo/check). Pending-save count has separate React state even when a read failure preserves the same snapshot. Stable React identifiers through creation confirmation preserve focus/next input.

Calendar differences use UTC midnights independently of DST day duration. A timer to local midnight and focus/visibility events refresh labels/queries. Due dates render as local calendar dates, without UTC-midnight conversion that could change the day. Event instants convert UTC to browser timezone.

No offline mode, service worker, live synchronization or virtualization. Clients read all 200-item API pages for a complete personal view. Browser tests use production builds, including optimized CSS/JavaScript effects. See [Tests](tests.md).

All three task views share contextual menus and selection actions. The portal-mounted menu is viewport-bounded, closes on scroll/outside click/Escape and manages keyboard focus. Mouse selection starts only on background outside tasks/controls after 6 px. Touch hold waits 450 ms and cancels before activation after 10 px movement. Desktop titles/card bodies also drag without intercepting checkboxes, menus or Ctrl/⌘-click; touch dragging starts only from grips. A simple click still edits. Rectangle/edge scrolling uses `requestAnimationFrame`; pointer tracking continues outside the task area until release/cancellation.

The fixed selection bar offers rescheduling, movement, reversible deletion and deselection. `BulkTaskDialog` sends displayed versions to `/tasks/bulk` and closes on confirmation. Synchronization retains errors, reconciles the entire conflicted batch and permits other actions. Menus call `/duplicate` or the same bulk archive for one task. Gestures stay local; only confirmed actions mutate the API. Selection includes only visible tasks and clears after submission/workspace change. Mobile drawers block background content/trap focus; touch targets, safe areas, field sizes and reduced motion are respected.

## Shared platform and library {#socle-commun-et-bibliotheque}

`SessionProvider` loads session, serializes partial language/theme writes and unmounts private data on sign-out/expiry. `AccountMenu` is shared. `platform/api.ts` owns in-memory CSRF, network errors and expiry/disable events. Old-session responses cannot invalidate a new session.

`ApplicationProvider` loads the catalogue and persists activation through the API. It cancels pending reads before mutations; stale responses cannot overwrite saved state. Home filters by `enabled`; the library shows all delivered applications. Empty/loading/error/retry states are explicit. Unknown paths do not become implicit Home routes.

Each `manifest.ts` maps only an identifier to `Page.tsx` using `React.lazy`; metadata stays server-owned. Shared controls/tokens live in `shared/styles/ui.css`, and business CSS loads with its Page. Boundary tests check imports between applications and from platform into business code.

## Session language {#langue-de-session}

`platform/i18n/` initializes i18next before rendering. Typed `tr` helpers use shared/application JSON; business resources load with the Page. `formatLocale()` formats dates/numbers. Interpolated strings render as React text, without dynamic HTML.

`SessionProvider` applies server `locale`, updates `html.lang` and remounts the private tree on changes. Each request carries a session/language generation; obsolete responses are ignored even through FR → EN → FR. Serialized preference writes preserve omitted fields. `AccountMenu.beforeSessionChange` waits for Tasks writes or consults Sport draft guards before language/sign-out. Unsaved forms remain transient. See [Internationalization](internationalisation.md).

## Sport / Tracking frame {#cadre-sport-suivi}

`ApplicationSidebar`/`ApplicationTopbar` supply accessible navigation through props; `ApplicationFooter` owns the footer. Pages retain guards, data and account behavior. Shared CSS follows `--ui-*`. Tracking composes keyboard-accessible month/year calendars, guided entry and metric/option search. `platform/useApiResource` cancels unmounted reads and ignores mutations finishing after unmount; drafts are transient and writes use server versions.

Reusable metric HTTP/types live in `frontend/src/platform/integrations/`; configuration/input components remain Tracking-owned.

### Badge and achievements {#badge-et-reussites}

Each Page injects `ProgressionBadge` into `ApplicationTopbar`’s optional `status` slot. Shared components remain neutral. The badge shows level/title/streak; its accessible panel lists three nearby quests. Escape/Close restore focus; outside click or keyboard exit closes it. Even at 320 px the topbar stays one line: 24 px level marker, 12 px streak symbol and 44 px targets. Mobile breadcrumbs begin with application name; page/title can truncate to retain counters. Full text remains accessible in button/panel; LifeOS stays in navigation.

`platform/progression` owns reusable types, transport, settings/styles. Successful mutations emit temporary `life-data-changed` to reread progression; the signal has no business rules/data. Language/foreground changes reread through `useApiResource`; stale results are cancelled. Sign-out/expiry unmounts progression. Tracking’s `Achievements` composes app choice, titles/levels, filtered wall and paginated journal. No browser progression storage.

## OKR interface {#interface-objectifs-okr}

`apps/okr` composes shared frame/badge/footer, horizon-guided forms, key results, board, paginated retrospective and archives. Native status/order controls match dragging; columns stack on narrow screens. Shared transport/resource hooks guard stale responses. Forms protect navigation, browser history, language and sign-out. OKR CSS never overrides navigation/footer; quest links use common library metadata.

Long mobile application names truncate visually to preserve the current breadcrumb and progress counters; full text remains accessible. Shared dialog Close buttons retain 44 px targets.

## General settings

`pages/SettingsPage` receives registered modules from the shell, composes authorized `Settings` panels, and manages direct links, browser history, drafts and pending writes through `SettingsPanelProps`. `useSettingsDraft` reports these states and clears them on unmount. `ProgressionSettings` separates General (timezone/vacations) from application usage days, preserving other fields in versioned writes. The account-name menu on Home/library offers Settings and Sign out with keyboard/Escape/focus return; application footers retain `AccountMenu`. See [ADR 007](decisions/007-reglages-generaux.md) and the [guide](settings.md).
