"""Sport capabilities retain domain validation, snapshots and immutable history."""

import hashlib
import json
from datetime import date, timedelta
from uuid import UUID

from pydantic import Field, TypeAdapter
from sqlalchemy import select

from life_app.apps.sport import models as m
from life_app.apps.sport import schemas as s
from life_app.apps.sport import service as svc
from life_app.apps.sport.kinds import kind_definitions
from life_app.core.database import utcnow
from life_app.core.i18n import locale
from life_app.platform.assistant.definition import ActionDefinition, ActionProvider, arguments


def action(
    name,
    description,
    method,
    path,
    handler,
    output_model,
    *,
    confirmation=False,
    precondition=None,
    preview_targets=None,
    **fields,
):
    output_adapter = TypeAdapter(output_model)

    def run(context, payload):
        result = handler(context, payload)
        context.db.flush()
        return output_adapter.validate_python(result, from_attributes=True)

    return ActionDefinition(
        name=name,
        description=description,
        input_model=arguments(
            "Sport" + "".join(part.title() for part in name.split("_")), **fields
        ),
        handler=run,
        method=method,
        path="/sport" + path,
        mutating=method != "GET",
        confirmation=confirmation,
        output_model=output_model,
        precondition=precondition,
        preview_targets=preview_targets,
    )


def output(context, item, formatter):
    context.db.flush()
    return formatter(item)


def scores_precondition(context, payload):
    rows = context.db.execute(
        select(
            m.Training.id,
            m.Training.version,
            m.Training.score,
            m.Training.status,
            m.Training.finished_at,
        )
        .where(m.Training.owner_id == context.user.id)
        .order_by(m.Training.id)
    ).all()
    state = [tuple(map(str, row)) for row in rows]
    return hashlib.sha256(json.dumps(state).encode()).hexdigest()


def score_targets(context, payload):
    return [
        f"{item.name} · {item.started_at.date().isoformat()}"
        for item in context.db.scalars(
            select(m.Training)
            .where(
                m.Training.owner_id == context.user.id,
                m.Training.status == "completed",
                m.Training.score.is_(None),
            )
            .order_by(m.Training.finished_at, m.Training.id)
        )
    ]


def set_target(context, payload):
    item = svc.owned(context.db, m.Training, context.user, payload.session_id)
    svc.set_position(item, payload.entry_index, payload.set_index)
    entry = svc.training_output(item).entries[payload.entry_index]
    label = "série" if locale() == "fr" else "set"
    return [f"{item.name} › {entry.name} · {label} {payload.set_index + 1}"]


provider = ActionProvider(
    actions=(
        action(
            "list_kinds",
            "Types d’exercice, champs et unités / Exercise kinds, fields and units.",
            "GET",
            "/kinds",
            lambda c, p: list(kind_definitions().values()),
            list[s.KindDefinition],
        ),
        action(
            "list_exercises",
            "Chercher exercices du catalogue et privés / Search exercises.",
            "GET",
            "/exercises",
            lambda c, p: svc.exercises(
                c.db,
                c.user,
                p.q,
                p.kind,
                p.muscle,
                p.equipment,
                p.archived,
                p.offset,
                p.limit,
                p.origin,
            ),
            s.ExercisePage,
            q=(str, Field("", max_length=160)),
            kind=(s.Kind | None, None),
            muscle=(str, ""),
            equipment=(str, ""),
            archived=(bool, False),
            origin=(s.ExerciseOrigin, "all"),
            offset=(int, Field(0, ge=0)),
            limit=(int, Field(50, ge=1, le=1000)),
        ),
        action(
            "exercise_filters",
            "Options muscles et matériel accessibles / Exercise filter options.",
            "GET",
            "/exercises/filters",
            lambda c, p: svc.exercise_filters(c.db, c.user, p.archived, p.origin),
            s.ExerciseFilters,
            archived=(bool, False),
            origin=(s.ExerciseOrigin, "all"),
        ),
        action(
            "get_exercise",
            "Lire un exercice / Read exercise.",
            "GET",
            "/exercises/{exercise_id}",
            lambda c, p: svc.exercise(c.db, c.user, p.exercise_id, active=False),
            s.ExerciseOutput,
            exercise_id=(str, ...),
        ),
        action(
            "create_exercise",
            "Créer un exercice personnel / Create personal exercise.",
            "POST",
            "/exercises",
            lambda c, p: output(
                c, svc.create_exercise(c.db, c.user, p.payload), svc.exercise_output
            ),
            s.ExerciseOutput,
            payload=(s.ExerciseInput, ...),
        ),
        action(
            "edit_exercise",
            "Modifier un exercice privé, instantanés préservés / Edit exercise.",
            "PUT",
            "/exercises/{exercise_id}",
            lambda c, p: output(
                c, svc.update_exercise(c.db, c.user, p.exercise_id, p.payload), svc.exercise_output
            ),
            s.ExerciseOutput,
            exercise_id=(UUID, ...),
            payload=(s.ExerciseUpdate, ...),
        ),
        action(
            "archive_exercise",
            "Archiver ou restaurer un exercice privé / Archive or restore exercise.",
            "PUT",
            "/exercises/{exercise_id}/archive",
            lambda c, p: output(
                c,
                svc.archive(c.db, c.user, m.Exercise, p.exercise_id, p.payload),
                svc.exercise_output,
            ),
            s.ExerciseOutput,
            confirmation=True,
            exercise_id=(UUID, ...),
            payload=(s.Archive, ...),
        ),
        action(
            "get_settings",
            "Lire les réglages Sport / Read Sport settings.",
            "GET",
            "/settings",
            lambda c, p: svc.settings(c.db, c.user),
            s.Settings,
        ),
        action(
            "save_settings",
            "Modifier les réglages Sport ; inclure la version courante / Update settings.",
            "PUT",
            "/settings",
            lambda c, p: svc.update_settings(c.db, c.user, p.payload),
            s.Settings,
            payload=(s.SettingsUpdate, ...),
        ),
        action(
            "list_workouts",
            "Lister/rechercher les programmes / Search workout programs.",
            "GET",
            "/workouts",
            lambda c, p: svc.workouts(c.db, c.user, p.archived, p.q, p.sort, p.exercise_id),
            list[s.WorkoutOutput],
            archived=(bool, False),
            q=(str, Field("", max_length=160)),
            sort=(s.WorkoutSort, "updated"),
            exercise_id=(str | None, Field(None, max_length=100)),
        ),
        action(
            "get_workout",
            "Lire un programme, même archivé / Read workout program.",
            "GET",
            "/workouts/{workout_id}",
            lambda c, p: svc.workout_output(svc.owned(c.db, m.Workout, c.user, p.workout_id)),
            s.WorkoutOutput,
            workout_id=(UUID, ...),
        ),
        action(
            "create_workout",
            "Créer un programme avec exercices et séries / Create workout program.",
            "POST",
            "/workouts",
            lambda c, p: output(c, svc.create_workout(c.db, c.user, p.payload), svc.workout_output),
            s.WorkoutOutput,
            payload=(s.WorkoutInput, ...),
        ),
        action(
            "edit_workout",
            "Modifier un programme ; séances passées inchangées / Edit workout program.",
            "PUT",
            "/workouts/{workout_id}",
            lambda c, p: output(
                c, svc.update_workout(c.db, c.user, p.workout_id, p.payload), svc.workout_output
            ),
            s.WorkoutOutput,
            workout_id=(UUID, ...),
            payload=(s.WorkoutUpdate, ...),
        ),
        action(
            "duplicate_workout",
            "Copier les cibles et notes d’un programme / Duplicate workout program.",
            "POST",
            "/workouts/{workout_id}/duplicate",
            lambda c, p: output(
                c, svc.duplicate_workout(c.db, c.user, p.workout_id, p.payload), svc.workout_output
            ),
            s.WorkoutOutput,
            workout_id=(UUID, ...),
            payload=(s.WorkoutDuplicate, ...),
        ),
        action(
            "archive_workout",
            "Archiver ou restaurer un programme / Archive or restore workout program.",
            "PUT",
            "/workouts/{workout_id}/archive",
            lambda c, p: output(
                c, svc.archive(c.db, c.user, m.Workout, p.workout_id, p.payload), svc.workout_output
            ),
            s.WorkoutOutput,
            confirmation=True,
            workout_id=(UUID, ...),
            payload=(s.Archive, ...),
        ),
        action(
            "list_sessions",
            "Historique des séances avec filtres/pagination / Search training history.",
            "GET",
            "/sessions",
            lambda c, p: svc.history(c.db, c.user, **p.model_dump()),
            s.SessionPage,
            offset=(int, Field(0, ge=0)),
            limit=(int, Field(30, ge=1, le=100)),
            q=(str, Field("", max_length=160)),
            workout_id=(UUID | None, None),
            status=(s.SessionStatus | None, None),
            since=(date | None, None),
            until=(date | None, None),
        ),
        action(
            "get_active_session",
            "Lire la séance active ou son absence / Read active training session.",
            "GET",
            "/sessions/active",
            lambda c, p: svc.current_session(c.db, c.user),
            s.TrainingOutput | None,
        ),
        action(
            "repair_scores",
            "Réparation explicite des anciens scores manquants / Backfill missing scores.",
            "POST",
            "/scores/backfill",
            lambda c, p: svc.backfill_scores(c.db, c.user),
            s.ScoreBackfill,
            confirmation=True,
            precondition=scores_precondition,
            preview_targets=score_targets,
        ),
        action(
            "get_session",
            "Lire une séance et ses résultats / Read training session.",
            "GET",
            "/sessions/{session_id}",
            lambda c, p: svc.training_output(svc.owned(c.db, m.Training, c.user, p.session_id)),
            s.TrainingOutput,
            session_id=(UUID, ...),
        ),
        action(
            "session_navigation",
            "Séances voisines dans l’historique filtré / Adjacent training sessions.",
            "GET",
            "/sessions/{session_id}/navigation",
            lambda c, p: svc.session_navigation(
                c.db, c.user, p.session_id, **p.model_dump(exclude={"session_id"})
            ),
            s.SessionNavigation,
            session_id=(UUID, ...),
            q=(str, Field("", max_length=160)),
            workout_id=(UUID | None, None),
            status=(s.SessionStatus | None, None),
            since=(date | None, None),
            until=(date | None, None),
        ),
        action(
            "start_session",
            "Démarrer une séance ; une seule active par compte / Start training session.",
            "POST",
            "/sessions",
            lambda c, p: output(c, svc.start(c.db, c.user, p.payload), svc.training_output),
            s.TrainingOutput,
            payload=(s.SessionStart, ...),
        ),
        action(
            "validate_set",
            "Valider/corriger une série ; indices à partir de zéro / Save a set.",
            "PUT",
            "/sessions/{session_id}/sets/{entry_index}/{set_index}",
            lambda c, p: output(
                c,
                svc.save_set(c.db, c.user, p.session_id, p.entry_index, p.set_index, p.payload),
                svc.training_output,
            ),
            s.TrainingOutput,
            session_id=(UUID, ...),
            entry_index=(int, ...),
            set_index=(int, ...),
            payload=(s.SetInput, ...),
        ),
        action(
            "undo_set",
            "Annuler une série validée / Undo validated set.",
            "DELETE",
            "/sessions/{session_id}/sets/{entry_index}/{set_index}",
            lambda c, p: output(
                c,
                svc.remove_set(c.db, c.user, p.session_id, p.entry_index, p.set_index, p.payload),
                svc.training_output,
            ),
            s.TrainingOutput,
            confirmation=True,
            preview_targets=set_target,
            session_id=(UUID, ...),
            entry_index=(int, ...),
            set_index=(int, ...),
            payload=(s.Version, ...),
        ),
        action(
            "adjust_rest",
            "Arrêter le repos ou l’ajuster de 15 secondes / Stop or adjust rest.",
            "PUT",
            "/sessions/{session_id}/rest",
            lambda c, p: output(
                c, svc.update_rest(c.db, c.user, p.session_id, p.payload), svc.training_output
            ),
            s.TrainingOutput,
            session_id=(UUID, ...),
            payload=(s.RestUpdate, ...),
        ),
        action(
            "finish_session",
            "Terminer ou abandonner une séance / Finish or abandon training session.",
            "PUT",
            "/sessions/{session_id}/finish",
            lambda c, p: output(
                c, svc.finish(c.db, c.user, p.session_id, p.payload), svc.training_output
            ),
            s.TrainingOutput,
            confirmation=True,
            session_id=(UUID, ...),
            payload=(s.SessionFinish, ...),
        ),
        action(
            "list_measurements",
            "Lister les mensurations / List body measurements.",
            "GET",
            "/measurements",
            lambda c, p: svc.measurements(c.db, c.user, p.archived),
            list[s.MeasurementOutput],
            archived=(bool, False),
        ),
        action(
            "get_measurement",
            "Lire une mensuration / Read body measurement.",
            "GET",
            "/measurements/{measurement_id}",
            lambda c, p: svc.measurement_output(
                svc.owned(c.db, m.Measurement, c.user, p.measurement_id)
            ),
            s.MeasurementOutput,
            measurement_id=(UUID, ...),
        ),
        action(
            "create_measurement",
            "Enregistrer des mensurations / Record body measurements.",
            "POST",
            "/measurements",
            lambda c, p: output(
                c, svc.save_measurement(c.db, c.user, p.payload), svc.measurement_output
            ),
            s.MeasurementOutput,
            payload=(s.MeasurementInput, ...),
        ),
        action(
            "edit_measurement",
            "Corriger des mensurations / Correct body measurements.",
            "PUT",
            "/measurements/{measurement_id}",
            lambda c, p: output(
                c,
                svc.save_measurement(
                    c.db,
                    c.user,
                    p.payload,
                    svc.owned(c.db, m.Measurement, c.user, p.measurement_id),
                ),
                svc.measurement_output,
            ),
            s.MeasurementOutput,
            measurement_id=(UUID, ...),
            payload=(s.MeasurementUpdate, ...),
        ),
        action(
            "archive_measurement",
            "Archiver/restaurer des mensurations / Archive or restore measurement.",
            "PUT",
            "/measurements/{measurement_id}/archive",
            lambda c, p: output(
                c,
                svc.archive(c.db, c.user, m.Measurement, p.measurement_id, p.payload),
                svc.measurement_output,
            ),
            s.MeasurementOutput,
            confirmation=True,
            measurement_id=(UUID, ...),
            payload=(s.Archive, ...),
        ),
        action(
            "statistics",
            "Statistiques Sport sur période UTC inclusive / Training statistics.",
            "GET",
            "/statistics",
            lambda c, p: svc.statistics(
                c.db,
                c.user,
                p.since or utcnow().date() - timedelta(days=365),
                p.until or utcnow().date(),
                p.exercise_id,
                p.workout_id,
                p.baseline_id,
            ),
            s.Statistics,
            since=(date | None, None),
            until=(date | None, None),
            exercise_id=(str | None, Field(None, max_length=100)),
            workout_id=(UUID | None, None),
            baseline_id=(UUID | None, None),
        ),
    )
)

provider = provider.with_labels(
    {
        "list_kinds": ("Types d’exercice et unités", "Exercise types and units"),
        "list_exercises": ("Rechercher des exercices", "Search exercises"),
        "exercise_filters": ("Filtres des exercices", "Exercise filters"),
        "get_exercise": ("Détails de l’exercice", "Exercise details"),
        "create_exercise": ("Créer un exercice", "Create an exercise"),
        "edit_exercise": ("Modifier un exercice", "Edit an exercise"),
        "archive_exercise": ("Archiver ou restaurer un exercice", "Archive or restore an exercise"),
        "get_settings": ("Réglages Sport", "Sport settings"),
        "save_settings": ("Modifier les réglages Sport", "Change Sport settings"),
        "list_workouts": ("Programmes d’entraînement", "Workout programs"),
        "get_workout": ("Détails du programme", "Workout details"),
        "create_workout": ("Créer un programme", "Create a workout"),
        "edit_workout": ("Modifier un programme", "Edit a workout"),
        "duplicate_workout": ("Dupliquer un programme", "Duplicate a workout"),
        "archive_workout": ("Archiver ou restaurer un programme", "Archive or restore a workout"),
        "list_sessions": ("Historique des séances", "Training history"),
        "get_active_session": ("Séance en cours", "Active training session"),
        "repair_scores": ("Recalculer les scores manquants", "Recalculate missing scores"),
        "get_session": ("Détails de la séance", "Training session details"),
        "session_navigation": ("Séances voisines", "Adjacent training sessions"),
        "start_session": ("Démarrer une séance", "Start a training session"),
        "validate_set": ("Enregistrer une série", "Save a set"),
        "undo_set": ("Annuler une série validée", "Undo a completed set"),
        "adjust_rest": ("Ajuster le temps de repos", "Adjust rest time"),
        "finish_session": ("Terminer ou abandonner la séance", "Finish or abandon the session"),
        "list_measurements": ("Mensurations enregistrées", "Saved body measurements"),
        "get_measurement": ("Détails des mensurations", "Body measurement details"),
        "create_measurement": ("Enregistrer des mensurations", "Save body measurements"),
        "edit_measurement": ("Corriger des mensurations", "Edit body measurements"),
        "archive_measurement": (
            "Archiver ou restaurer des mensurations",
            "Archive or restore measurements",
        ),
        "statistics": ("Statistiques d’entraînement", "Training statistics"),
    }
)
