# Sport UX — delivery of the 39 improvements

This release implements the follow-up to the [17 November 2026 review](revue-sport-2026-11-17.md), authorized in [issue #74](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/74). Sport settings use the ADR 007 panel at `/settings?application=sport`, with common draft and pending-write guards. The [Sport guide](sport.md) and [API reference](sport-api.md) describe the delivered behavior. The original audit retains its historical observations and measurements.

| Point | Delivered behavior | Main verification |
| --- | --- | --- |
| 01 | Draft protection for exercises, measurements, settings and completion notes | Closing, navigation, language and sign-out guards |
| 02 | Closing blocked during writes; result reconciled | Delayed response, Escape and exactly one object created |
| 03 | Set fields read-only during save; pagination retains focus | Enter, correction, undo and keyboard pagination |
| 04 | Compare versions, explicitly resume and copy drafts | Real conflict from a second client and API verification |
| 05 | Higher-contrast common light accent | Shared matrix and contrast checks |
| 06 | List/grid per section and format, using partial API preferences | Reload, width change and rest preservation |
| 07 | At most three preview exercises, full detail and independent rows | Programs with 1/4/12/50 exercises and long names |
| 08 | Filters, pages and selection in URL; restored return position | Section changes, browser back and reload |
| 09 | Search after 250 ms without typing; previous results retained | Rapid typing, delayed and obsolete responses |
| 10 | Normalized values compared with the original draft | 40 → 41 → 40 no longer blocks completion |
| 11 | Server UTC date in settings | UTC contract and browser timezone difference |
| 12 | Local and server field errors; first invalid field receives focus | Blank names, bounds, nested fields and server errors |
| 13 | Program search, sort, last session and duplication | Owner-scoped contracts and copy without history |
| 14 | Paginated catalogue, selection across pages, individual/batch addition | Filters, limits and explicit repeat addition |
| 15 | Compact editor, persistent actions and direct position selection | Mobile, reduced keyboard viewport and saved API order |
| 16 | Immediate archive undo and affected exercise programs | Archive/restore, errors and preserved draft |
| 17 | Origin, muscle and equipment facets independent of pagination | Personal exercises and complete supplied catalogue |
| 18 | Explicit personal copy, exercise detail and program addition | Separate object creation and draft addition |
| 19 | Next set, session outline and exercise collapse | Destination focus, expected set and preserved values |
| 20 | Preparation notes frozen in the session | Later program edits do not alter history |
| 21 | Compact idle rest and resumption from other sections | Height, scroll, keyboard and return to training |
| 22 | Presets and persistent ±15 seconds | Server deadline, version and rejection after expiration |
| 23 | Summary, performed/skipped sets, metrics and recorded XP | Completion response and actual progression total |
| 24 | API-filtered history grouped by month | Search, program, state, dates and pagination |
| 25 | Detail URL, filtered neighbors, compact dates and score shown first | Direct access, browser return and immutability |
| 26 | Quick measurements and additional-measure section | Editing weight preserves collapsed measurements |
| 27 | Compact view, neutral differences and chart access | Previous available value and excluded archives |
| 28 | Common periods, validation and retained results | Reversed period, URL and apply action |
| 29 | Horizontal spacing proportional to dates/times | Close and distant measurements, same-day sessions |
| 30 | Touch/keyboard points, summary and table | Arrows, Home/End, Escape and touch target |
| 31 | Units, distinct occurrences and dated baseline | Statistics contract and explicit selection |
| 32 | Relevant next action in empty states | Create, choose, broaden period and clear filters |
| 33 | Section-first breadcrumb and compact badge | 320 px, long titles and complete accessible labels |
| 34 | Common menu for shallow touch landscape | Orientation, focus, footer and inert background |
| 35 | Readable metadata, 16 px touch inputs and 44 px controls | Dimensions, long content, themes and narrow width |
| 36 | Consistent Sport, strength, duration, distance and measurement icons | Accessible names and hierarchy independent of color |
| 37 | Explicit automatic/standard/HYROX context and compact banners | API context, snapshots, renaming and preserved date |
| 38 | 140 ms color, 160 ms opening/addition and 180 ms confirmation/summary | Reduced motion and immediate focus |
| 39 | Empty rest distinct from zero, help and presets | Validation, discard and API persistence |

## Choices and limitations

Switching list/grid adds no movement animation that would delay controls or move their targets. Additions and confirmations use short motion; archive actions wait for server success and offer undo. Reduced motion disables Sport animations and transitions.

Point 22 makes sound and vibration conditional on physical-device validation. They are not enabled, and no background alarm is promised. For point 39, minutes:seconds entry was evaluated: a second format would make existing values ambiguous. Durations retain explicit seconds and API bounds, without implicit conversion.

Automated checks use synthetic accounts and databases. Touch emulation, reduced viewports and WebKit do not replace a physical iPhone or Android. Native screen readers, screen locking, sunlight and low-powered hardware remain outside this acceptance run. Executed checks, corrections, published commit and production verification are recorded in the issue and pull request.

## Data and operations

Additive migration `0014_sport_ux` preserves existing data. Sport settings store six view preferences; context and preparation notes follow the session lifecycle. Filters are read parameters; drafts stay in memory. See the [data model](donnees.md#migration-0014-finition-sport) and [backup/restore constraints](sauvegardes.md#migration-0014-finition-sport).

## Mobile density correction

A second review following the report that controls obscured the lists measured actual initial content visibility, in addition to overflow. The comparison uses the same synthetic account, programs with 1–12 exercises, records with 12 measurements and a **390 × 664 px** viewport. The baseline is commit `db50d4f`.

| First useful content | Before position | After position |
| --- | ---: | ---: |
| Program row | 495 px | 237 px |
| Catalogue exercise | 596 px | 259 px |
| Measurement record | 436 px | 231 px |
| History session | 451 px | 201 px |
| First chart card | 809 px | 370 px |
| First editor exercise | 730 px | 362 px |
| First set input | 723 px | 267 px |

The initial lists show four complete programs, four exercises or three measurement records at this size; program rows shrink from about 281 to 83 px. At 320 × 568, scenarios require at least two complete rows. Controls retain 44 px targets and touch inputs retain 16 px text. Full detail remains available through titles or dates, and secondary controls through Actions or Filters. Mobile preferences also cover touch landscape up to 1024 × 500 px.

Captures and scenarios cover lists/grids, expanded filters, action menus, creation/editing, the picker, empty/active training, history/detail, records/forms, statistics and settings. Measurements use synthetic data and emulated viewports; actual usable device height also depends on browser bars and keyboards. See [test criteria](tests.md#sport-mobile-density) and [phone workflows](sport.md#reading-and-acting-on-a-phone).

This correction changes no tables, schema versions or API rules. Deployment keeps migration `0014_sport_ux` and the usual backup procedure.
