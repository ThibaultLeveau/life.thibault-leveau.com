"""Tracking capabilities share the HTTP API's contracts and transaction-free services."""

import json
from datetime import date
from typing import Annotated
from uuid import UUID

from pydantic import Field

from life_app.apps.tracking import schemas as s
from life_app.apps.tracking import service as svc
from life_app.platform.assistant.definition import ActionDefinition, ActionProvider, arguments

Offset = Annotated[int, Field(ge=0)]
Limit = Annotated[int, Field(ge=1, le=100)]


def output(ctx, item):
    ctx.db.flush()
    return svc.output(item)


provider = ActionProvider(
    actions=(
        ActionDefinition(
            name="list_trackers",
            description="List active or archived tracking definitions and their current versions.",
            input_model=arguments("TrackingList", archived=(bool, False)),
            handler=lambda c, a: [svc.output(i) for i in svc.trackers(c.db, c.user, a.archived)],
            method="GET",
            path="/tracking/trackers",
            output_model=list[s.TrackerOutput],
        ),
        ActionDefinition(
            name="create_tracker",
            description="Create a habit tracker with fields, schedule and optional metric sources.",
            input_model=arguments("TrackingCreate", payload=(s.TrackerInput, ...)),
            handler=lambda c, a: output(
                c, svc.create_tracker(c.db, c.user, c.definitions, a.payload)
            ),
            method="POST",
            path="/tracking/trackers",
            mutating=True,
            output_model=s.TrackerOutput,
        ),
        ActionDefinition(
            name="order_trackers",
            description="Reorder all active trackers; provide every active tracker exactly once.",
            input_model=arguments("TrackingOrder", payload=(s.Order, ...)),
            handler=lambda c, a: [
                svc.output(i) for i in svc.order_trackers(c.db, c.user, a.payload)
            ],
            method="PUT",
            path="/tracking/trackers/order",
            mutating=True,
            confirmation=True,
            output_model=list[s.TrackerOutput],
            precondition=lambda c, a: json.dumps(
                [(str(i.id), i.version, i.position) for i in svc.trackers(c.db, c.user)]
            ),
        ),
        ActionDefinition(
            name="get_tracker",
            description="Read one owned tracker, including its fields and current version.",
            input_model=arguments("TrackingGet", id=(UUID, ...)),
            handler=lambda c, a: svc.output(svc.owned(c.db, c.user, a.id)),
            method="GET",
            path="/tracking/trackers/{id}",
            output_model=s.TrackerOutput,
        ),
        ActionDefinition(
            name="update_tracker",
            description=(
                "Replace a tracker definition at its expected version. Frequency, timezone and "
                "start date stay fixed; saved entry snapshots keep their original definition."
            ),
            input_model=arguments("TrackingUpdate", id=(UUID, ...), payload=(s.TrackerUpdate, ...)),
            handler=lambda c, a: output(
                c,
                svc.update_tracker(
                    c.db, c.user, c.definitions, svc.owned(c.db, c.user, a.id), a.payload
                ),
            ),
            method="PUT",
            path="/tracking/trackers/{id}",
            mutating=True,
            output_model=s.TrackerOutput,
        ),
        ActionDefinition(
            name="archive_tracker",
            description="Archive or restore a tracker without deleting its entries or history.",
            input_model=arguments("TrackingArchive", id=(UUID, ...), payload=(s.Archive, ...)),
            handler=lambda c, a: output(
                c, svc.archive(c.db, c.user, svc.owned(c.db, c.user, a.id), a.payload)
            ),
            method="PUT",
            path="/tracking/trackers/{id}/archive",
            mutating=True,
            confirmation=True,
            output_model=s.TrackerOutput,
        ),
        ActionDefinition(
            name="get_settings",
            description="Read the account's tracking timezone.",
            input_model=arguments("TrackingSettingsGet"),
            handler=lambda c, a: svc.settings(c.db, c.user),
            method="GET",
            path="/tracking/settings",
            output_model=s.Settings,
        ),
        ActionDefinition(
            name="save_settings",
            description="Set the account's tracking timezone.",
            input_model=arguments("TrackingSettingsSave", payload=(s.Settings, ...)),
            handler=lambda c, a: svc.save_settings(c.db, c.user, a.payload),
            method="PUT",
            path="/tracking/settings",
            mutating=True,
            output_model=s.Settings,
            precondition=lambda c, a: svc.settings(c.db, c.user).timezone,
        ),
        ActionDefinition(
            name="current",
            description="Read tracker occurrences for a date, or today in each tracker's timezone.",
            input_model=arguments(
                "TrackingCurrent", day=(date | None, None), include_archived=(bool, False)
            ),
            handler=lambda c, a: svc.current(c.db, c.user, a.day, a.include_archived),
            method="GET",
            path="/tracking/current",
            output_model=list[s.Occurrence],
        ),
        ActionDefinition(
            name="calendar",
            description="Read the calendar for an inclusive date range and optional tracker.",
            input_model=arguments(
                "TrackingCalendar",
                since=(date, ...),
                until=(date, ...),
                tracker_id=(UUID | None, None),
            ),
            handler=lambda c, a: svc.calendar(c.db, c.user, a.since, a.until, a.tracker_id),
            method="GET",
            path="/tracking/calendar",
            output_model=s.Calendar,
        ),
        ActionDefinition(
            name="statistics",
            description="Read tracking completion rates, scores and trends for an inclusive range.",
            input_model=arguments(
                "TrackingStatistics",
                since=(date, ...),
                until=(date, ...),
                tracker_id=(UUID | None, None),
            ),
            handler=lambda c, a: svc.statistics(c.db, c.user, a.since, a.until, a.tracker_id),
            method="GET",
            path="/tracking/statistics",
            output_model=s.Statistics,
        ),
        ActionDefinition(
            name="achievements",
            description="Read tracking achievements, completed periods and streaks.",
            input_model=arguments("TrackingAchievements"),
            handler=lambda c, a: svc.achievements(c.db, c.user),
            method="GET",
            path="/tracking/achievements",
            output_model=s.Achievement,
        ),
        ActionDefinition(
            name="get_entry",
            description="Read a tracker occurrence and its saved entry for a date.",
            input_model=arguments("TrackingEntryGet", id=(UUID, ...), day=(date, ...)),
            handler=lambda c, a: svc.get_occurrence(
                c.db, c.user, svc.owned(c.db, c.user, a.id), a.day
            )[0],
            method="GET",
            path="/tracking/trackers/{id}/entries/{day}",
            output_model=s.Occurrence,
        ),
        ActionDefinition(
            name="preview_entry",
            description="Preview current source metrics without changing the saved entry snapshot.",
            input_model=arguments("TrackingEntryPreview", id=(UUID, ...), day=(date, ...)),
            handler=lambda c, a: svc.preview(
                c.db, c.user, c.definitions, svc.owned(c.db, c.user, a.id), a.day
            ),
            method="POST",
            path="/tracking/trackers/{id}/entries/{day}/preview",
            output_model=s.Occurrence,
        ),
        ActionDefinition(
            name="write_entry",
            description=(
                "Save partial tracker values, explicitly refresh sources or complete an entry. "
                "Use expected_version 0 only when no entry exists."
            ),
            input_model=arguments(
                "TrackingEntryWrite", id=(UUID, ...), day=(date, ...), payload=(s.EntryWrite, ...)
            ),
            handler=lambda c, a: svc.write_entry(
                c.db, c.user, c.definitions, svc.owned(c.db, c.user, a.id), a.day, a.payload
            ),
            method="PUT",
            path="/tracking/trackers/{id}/entries/{day}",
            mutating=True,
            output_model=s.EntryOutput,
        ),
        ActionDefinition(
            name="entry_history",
            description="Read saved revisions of an owned tracker entry, newest version first.",
            input_model=arguments(
                "TrackingEntryHistory",
                id=(UUID, ...),
                day=(date, ...),
                offset=(Offset, 0),
                limit=(Limit, 30),
            ),
            handler=lambda c, a: svc.history(c.db, c.user, a.id, a.day, a.offset, a.limit),
            method="GET",
            path="/tracking/trackers/{id}/entries/{day}/history",
            output_model=list[s.EntryRevision],
        ),
    )
)

provider = provider.with_labels(
    {
        "list_trackers": ("Consulter les suivis", "View trackers"),
        "create_tracker": ("Créer un suivi", "Create a tracker"),
        "order_trackers": ("Réordonner les suivis", "Reorder trackers"),
        "get_tracker": ("Consulter un suivi", "View a tracker"),
        "update_tracker": ("Modifier un suivi", "Update a tracker"),
        "archive_tracker": ("Archiver ou restaurer un suivi", "Archive or restore a tracker"),
        "get_settings": ("Consulter les réglages de Suivi", "View Tracking settings"),
        "save_settings": ("Modifier les réglages de Suivi", "Update Tracking settings"),
        "current": ("Consulter les suivis du jour", "View daily tracking"),
        "calendar": ("Consulter le calendrier de Suivi", "View the tracking calendar"),
        "statistics": ("Consulter les statistiques de Suivi", "View tracking statistics"),
        "achievements": ("Consulter les réussites de Suivi", "View tracking achievements"),
        "get_entry": ("Consulter une saisie", "View an entry"),
        "preview_entry": ("Prévisualiser une saisie", "Preview an entry"),
        "write_entry": ("Enregistrer une saisie", "Save an entry"),
        "entry_history": ("Consulter les corrections d’une saisie", "View entry revisions"),
    }
)
