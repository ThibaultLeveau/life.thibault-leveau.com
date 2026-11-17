# Task management — specification

**Status:** contract implemented in the repository; architecture approved in [ADR 002](decisions/002-gestion-taches.md). **Tracking:** [issue #3](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/3).

This preserves the original request’s scope and acceptance scenarios. [User guide](taches.md), [data model](donnees.md) and [API](api.md) describe delivered behavior. Domain availability depends on deployment. [ADR 001](decisions/001-architecture-initiale.md) records the initial platform; Thibault’s storage/authentication approval is recorded in the issue and ADR 002.

## Organization and vocabulary {#organisation-et-vocabulaire}

A **workspace** groups personal/professional tasks and has a name, description, color, order, configurable sections/statuses and an authenticated owner.

A **section** groups tasks within a workspace, with name/description/color/order and list/board/both visibility. It becomes a checklist in list view or a row across status columns in kanban. Visibility changes no tasks or completion states.

A **status** belongs to a workspace and forms a kanban column. Name/color/order and open/completed type are configurable. Retain at least one open and one completed status. Initial To do/In progress/Done values allow immediate use.

A **task** belongs to one workspace, optional same-workspace section and same-workspace status. It has title, description, priority, optional due date, labels, manual order and lifecycle dates. No section allows creation before organization.

### Two-view example {#exemple-des-deux-vues}

Home and Administration sections in Personal become two checklists. The same data in kanban:

| Section / status | To do | In progress | Done |
| --- | --- | --- | --- |
| Home | Fix the lamp | Tidy the desk | Install the shelf |
| Administration | File invoices | Renew subscription | Submit paperwork |

Moving Fix the lamp to Done completes it and checks its list checkbox. Changing only row changes section without completing it.

## Interface {#interface}

Todoist is the visual reference: compact sidebar, workspace heading, quick creation, subtle dividers, round checkboxes, readable cards, contextual actions and details. Preserve Life identity/local resources.

Todoist documents [list sections](https://www.todoist.com/help/todoist/features/introduction-to-sections-rOrK0aEn) and [board cards](https://www.todoist.com/help/todoist/features/use-the-board-layout-in-todoist-AiAVsyEI). Life’s specific contract differs: sections are rows and statuses columns.

Flows cover workspace creation/selection/settings/archives; list/board switching and header search/view settings; quick-add within section/cell and complete editing; section/status configuration; checkbox and explicit completion/reopening; dragging/reordering with keyboard/touch movement equivalents; clear action outcomes and retained input on failure.

Light/dark/system must cover all forms/menus and persist on reload. Check contrast, focus, accessible names, dialog closing and focus restoration. Mobile navigation collapses, boards scroll within their region, and essential actions require neither hover nor dragging. Include loading, no workspace, empty workspace, no filter results, network failure and expired session.

## Configuration {#configuration}

All settings are available in UI/API and must persist after reload/new login.

| Scope | Settings |
| --- | --- |
| User | Light/dark/system theme |
| Workspaces | Name/description/color/order/archive/restore |
| Sections | Same properties plus list/board/both visibility |
| Statuses | Name/color/order/open-completed type/create/remove with explicit replacement |
| Tasks | Title/description/section/workspace/status/priority/due date/labels/order |
| Workspace view | List/board, density, completed visibility, search/filter/sort |

Filters include status/priority/labels/due date; search matches title/description. Offer manual/priority/due-date sorting. Automatic sort must not silently turn into manual order; explain how to switch. View preferences never change lifecycle dates or business relationships. Hidden data remains available through appropriate API/view settings.

## Lifecycle and future statistics {#cycle-de-vie-et-statistiques-futures}

The delivery prepares historical data; dedicated statistical dashboards come later.

| Action | Expected result |
| --- | --- |
| Create | Creation/update dates and created event |
| Open → completed | Completion date and one completion event |
| Completed → open | Reopened event; prior completions retained |
| Same-type status change | No extra completion/reopening |
| Repeat satisfied action | No duplicate completion event |
| Move/rename | Retained history/coherent references |
| Archive/restore | Preserved data; no fictional completion |

Keep UTC instants distinct from calendar due dates. History preserves repeated completion/reopening and event-time workspace/section/status even after moves/renames, without unnecessary private title/description copies.

Data/events share a transaction; errors leave no partial move or orphan event. Explicit concurrency handling prevents silent loss/duplicate completion. Parent archive hides content without completing tasks; restore retains individual task archives. Future deletion must specify history/backup effects.

Reject type changes on used statuses, avoiding reinterpretation of history. Removal requires same open/completed-type replacement. Actual completion changes use explicit task transitions.

## API contract {#contrat-api}

Implemented resources; see [API](api.md)/OpenAPI for exact methods/schemas/codes/examples.

| Resource under `/api/v1` | Required operations |
| --- | --- |
| auth/session | Sign in/read session/sign out |
| preferences | Read/update user preferences |
| workspaces | List/create/read/edit/order/archive/restore |
| workspaces/{id}/sections | List/create/edit/order/visibility/archive/restore |
| workspaces/{id}/statuses | List/create/edit/order/remove/reassign |
| workspaces/{id}/labels | Label management/associations |
| workspaces/{id}/view | View preferences |
| tasks | Filtered pagination/create/read/edit |
| tasks/{id}/move | Atomic movement/position |
| tasks/{id}/complete and reopen | Explicit checkbox transitions |
| tasks/{id}/events | Paginated lifecycle history |

PATCH archived handles archive/restore. Ordering explicitly identifies affected objects and rejects foreign owners. Cross-workspace movement requires destination-compatible section/status and documented label behavior.

Every route validates session/ownership on the server. Foreign private identifiers disclose no content. Never trust client-supplied owner. Document validation 422, session 401, protections 403, missing/inaccessible 404, conflicts 409 and rate-limit 429 where applicable. Errors expose no secrets/database connection details.

Independent HTTP examples must cover login, workspace/task creation, move, complete/reopen, history and logout without direct database access. Unknown routes remain real 404.

## Acceptance scenarios {#scenarios-de-recette}

Validate outcomes on synthetic data, not merely file/route existence.

| Scenario | Evidence |
| --- | --- |
| Two workspaces/multiple sections | API/reload preserve names/colors/order |
| Every section visibility | Only intended views, no loss |
| Check/uncheck/recheck | Consistent views, two completions/one reopen |
| Drag columns/rows | Persisted status/section/order, accessible command parity |
| Cross-workspace move | Coherent references/labels and retained history |
| Reorder/configure statuses | Reloaded columns, at least one of each type |
| Archive/restore parents/tasks | Completion dates/individual archives preserved |
| Search/filter/sort/density | Correct results and stored preferences |
| Themes | Readable forms at 320/375 px and desktop/keyboard |
| Missing/expired/revoked session | No business reads/writes |
| Other-owner resource | Rejected access/mutations, no response leakage |
| Failed/repeated mutation | No partial data/double completion; usable UI errors |
| Empty migration/backup restore | PostgreSQL schema/constraints/synthetic data recovered |
| HTTP client only | Every interface business operation accessible |

Run make check/test/build and meaningful behavior tests before PR. Packaging changes also require Docker build/container HTTP tests where possible. Record actual results, review the complete diff and await latest-commit CI before merging.

## Delivery documentation {#documentation-de-livraison}

ADR 002 records approval without rewriting ADR 001. User/API/data/test/backup guides describe the result; AGENTS.md contains API/documentation requirements. Record results/review in issue/PR. After every merge deploy to the VPS following [Deployment](deploiement.md), verify and record publication.
