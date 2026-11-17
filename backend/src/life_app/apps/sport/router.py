from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select

from life_app.apps.sport import models as m
from life_app.apps.sport import schemas as s
from life_app.apps.sport import service as svc
from life_app.apps.sport.kinds import kind_definitions
from life_app.core.database import Database, utcnow
from life_app.platform.auth.service import CurrentUser

router = APIRouter(
    prefix="/sport",
    tags=["Sport"],
    responses={
        401: {"description": "Session requise"},
        403: {"description": "Application désactivée ou CSRF invalide"},
        404: {"description": "Élément inexistant ou appartenant à un autre compte"},
        409: {"description": "Version obsolète ou transition impossible"},
        422: {"description": "Données invalides ou mesures incompatibles avec le type"},
    },
)


def commit(db, item, output):
    db.flush()
    result = output(item)
    db.commit()
    return result


@router.get("/kinds", response_model=list[s.KindDefinition])
def kinds(user: CurrentUser):
    """Types, champs, unités, bornes et formule de performance : source des formulaires."""
    return list(kind_definitions().values())


@router.get("/exercises", response_model=s.ExercisePage)
def exercises(
    user: CurrentUser,
    db: Database,
    q: str = Query("", max_length=160),
    kind: s.Kind | None = None,
    muscle: str = "",
    equipment: str = "",
    archived: bool = False,
    origin: s.ExerciseOrigin = "all",
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
):
    """Catalogue fourni et exercices personnels ; recherche sans accents, filtres et pagination."""
    return svc.exercises(db, user, q, kind, muscle, equipment, archived, offset, limit, origin)


@router.get("/exercises/filters", response_model=s.ExerciseFilters)
def exercise_filters(
    user: CurrentUser, db: Database, archived: bool = False, origin: s.ExerciseOrigin = "all"
):
    """Options localisées du catalogue entier accessible, indépendantes de sa pagination."""
    return svc.exercise_filters(db, user, archived, origin)


@router.get("/exercises/{exercise_id}", response_model=s.ExerciseOutput)
def get_exercise(exercise_id: str, user: CurrentUser, db: Database):
    return svc.exercise(db, user, exercise_id, active=False)


@router.post("/exercises", response_model=s.ExerciseOutput, status_code=201)
def create_exercise(payload: s.ExerciseInput, user: CurrentUser, db: Database):
    item = m.Exercise(owner_id=user.id, **payload.model_dump())
    db.add(item)
    return commit(db, item, svc.exercise_output)


@router.put("/exercises/{exercise_id}", response_model=s.ExerciseOutput)
def update_exercise(exercise_id: UUID, payload: s.ExerciseUpdate, user: CurrentUser, db: Database):
    """Modifier un exercice ; conserver les instantanés des programmes et entraînements."""
    item = svc.owned(db, m.Exercise, user, exercise_id)
    svc.version(item, payload.expected_version)
    for key, value in payload.model_dump(exclude={"expected_version"}).items():
        setattr(item, key, value)
    svc.touch(item)
    return commit(db, item, svc.exercise_output)


@router.put("/exercises/{exercise_id}/archive", response_model=s.ExerciseOutput)
def archive_exercise(exercise_id: UUID, payload: s.Archive, user: CurrentUser, db: Database):
    return commit(db, svc.archive(db, user, m.Exercise, exercise_id, payload), svc.exercise_output)


@router.get("/settings", response_model=s.Settings)
def settings(user: CurrentUser, db: Database):
    return svc.settings(db, user)


@router.put("/settings", response_model=s.Settings)
def update_settings(payload: s.SettingsUpdate, user: CurrentUser, db: Database):
    """Écriture partielle : seuls les champs présents changent. Version attendue facultative."""
    result = svc.update_settings(db, user, payload)
    db.commit()
    return result


@router.get("/workouts", response_model=list[s.WorkoutOutput])
def workouts(
    user: CurrentUser,
    db: Database,
    archived: bool = False,
    q: str = Query("", max_length=160),
    sort: s.WorkoutSort = "updated",
    exercise_id: str | None = Query(None, max_length=100),
):
    """Programmes filtrés et triés ; dernière utilisation calculée sur les séances du compte."""
    return svc.workouts(db, user, archived, q, sort, exercise_id)


@router.get("/workouts/{workout_id}", response_model=s.WorkoutOutput)
def get_workout(workout_id: UUID, user: CurrentUser, db: Database):
    """Lire un programme, même archivé, pour sa page de modification."""
    return svc.workout_output(svc.owned(db, m.Workout, user, workout_id))


@router.post("/workouts", response_model=s.WorkoutOutput, status_code=201)
def create_workout(payload: s.WorkoutInput, user: CurrentUser, db: Database):
    """Créer un programme avec 1 à 50 exercices et au maximum 300 séries."""
    item = m.Workout(
        owner_id=user.id,
        name=payload.name,
        competition_date=payload.competition_date,
        context=payload.context,
        notes=payload.notes,
        entries=svc.snapshot(db, user, payload.entries),
    )
    db.add(item)
    return commit(db, item, svc.workout_output)


@router.put("/workouts/{workout_id}", response_model=s.WorkoutOutput)
def update_workout(workout_id: UUID, payload: s.WorkoutUpdate, user: CurrentUser, db: Database):
    """Modifier un programme : nom, notes et exercices ordonnés ; entraînements inchangés."""
    item = svc.owned(db, m.Workout, user, workout_id)
    svc.version(item, payload.expected_version)
    item.name, item.notes = payload.name, payload.notes
    item.competition_date = payload.competition_date
    if "context" in payload.model_fields_set:
        item.context = payload.context
    item.entries = svc.snapshot(db, user, payload.entries)
    svc.touch(item)
    return commit(db, item, svc.workout_output)


@router.post("/workouts/{workout_id}/duplicate", response_model=s.WorkoutOutput, status_code=201)
def duplicate_workout(
    workout_id: UUID, payload: s.WorkoutDuplicate, user: CurrentUser, db: Database
):
    """Copier les cibles et notes, sans séances, scores, dates de création ni archivage hérités."""
    return commit(db, svc.duplicate_workout(db, user, workout_id, payload), svc.workout_output)


@router.put("/workouts/{workout_id}/archive", response_model=s.WorkoutOutput)
def archive_workout(workout_id: UUID, payload: s.Archive, user: CurrentUser, db: Database):
    return commit(db, svc.archive(db, user, m.Workout, workout_id, payload), svc.workout_output)


@router.get("/sessions", response_model=s.SessionPage)
def sessions(
    user: CurrentUser,
    db: Database,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    q: str = Query("", max_length=160),
    workout_id: UUID | None = None,
    status: s.SessionStatus | None = None,
    since: date | None = None,
    until: date | None = None,
):
    return svc.history(
        db, user, offset, limit, q=q, workout_id=workout_id, status=status, since=since, until=until
    )


@router.get("/sessions/active", response_model=s.TrainingOutput | None)
def current_session(user: CurrentUser, db: Database):
    item = db.scalar(
        select(m.Training).where(m.Training.owner_id == user.id, m.Training.status == "active")
    )
    return svc.training_output(item) if item else None


@router.post("/scores/backfill", response_model=s.ScoreBackfill)
def backfill_scores(user: CurrentUser, db: Database):
    """Réparer les scores manquants des séances terminées du compte ; opération idempotente.

    Préserve scores déjà numériques, séries, dates, notes, versions et progression.
    Les lectures ne réécrivent jamais l’historique.
    """
    result = svc.backfill_scores(db, user)
    db.commit()
    return result


@router.get("/sessions/{session_id}", response_model=s.TrainingOutput)
def get_session(session_id: UUID, user: CurrentUser, db: Database):
    return svc.training_output(svc.owned(db, m.Training, user, session_id))


@router.get("/sessions/{session_id}/navigation", response_model=s.SessionNavigation)
def session_navigation(
    session_id: UUID,
    user: CurrentUser,
    db: Database,
    q: str = Query("", max_length=160),
    workout_id: UUID | None = None,
    status: s.SessionStatus | None = None,
    since: date | None = None,
    until: date | None = None,
):
    return svc.session_navigation(
        db, user, session_id, q=q, workout_id=workout_id, status=status, since=since, until=until
    )


@router.post("/sessions", response_model=s.TrainingOutput, status_code=201)
def start_session(payload: s.SessionStart, user: CurrentUser, db: Database):
    """Démarrer avec les derniers résultats proposés par série, sans les valider.

    Les propositions sont figées dans entries[].suggested_values et les objectifs restent
    inchangés. Un seul entraînement actif par compte (409 sinon).
    """
    return commit(db, svc.start(db, user, payload), svc.training_output)


@router.put(
    "/sessions/{session_id}/sets/{entry_index}/{set_index}", response_model=s.TrainingOutput
)
def validate_set(
    session_id: UUID,
    entry_index: int,
    set_index: int,
    payload: s.SetInput,
    user: CurrentUser,
    db: Database,
):
    """Indices à partir de 0. Une correction ne relance pas le repos serveur."""
    return commit(
        db, svc.save_set(db, user, session_id, entry_index, set_index, payload), svc.training_output
    )


@router.delete(
    "/sessions/{session_id}/sets/{entry_index}/{set_index}", response_model=s.TrainingOutput
)
def undo_set(
    session_id: UUID,
    entry_index: int,
    set_index: int,
    payload: s.Version,
    user: CurrentUser,
    db: Database,
):
    return commit(
        db,
        svc.remove_set(db, user, session_id, entry_index, set_index, payload),
        svc.training_output,
    )


@router.put("/sessions/{session_id}/rest", response_model=s.TrainingOutput)
def stop_rest(session_id: UUID, payload: s.RestUpdate, user: CurrentUser, db: Database):
    """Arrêter ou ajuster de 15 secondes un repos actif, avec contrôle de version."""
    return commit(db, svc.update_rest(db, user, session_id, payload), svc.training_output)


@router.put("/sessions/{session_id}/finish", response_model=s.TrainingOutput)
def finish_session(session_id: UUID, payload: s.SessionFinish, user: CurrentUser, db: Database):
    """Terminer avec les séries restantes à zéro, ou abandonner ; historique immuable."""
    return commit(db, svc.finish(db, user, session_id, payload), svc.training_output)


@router.get("/measurements", response_model=list[s.MeasurementOutput])
def measurements(user: CurrentUser, db: Database, archived: bool = False):
    return [
        svc.measurement_output(i)
        for i in db.scalars(
            select(m.Measurement)
            .where(
                m.Measurement.owner_id == user.id,
                m.Measurement.archived_at.is_not(None)
                if archived
                else m.Measurement.archived_at.is_(None),
            )
            .order_by(m.Measurement.measured_on.desc(), m.Measurement.id)
        )
    ]


@router.get("/measurements/{measurement_id}", response_model=s.MeasurementOutput)
def get_measurement(measurement_id: UUID, user: CurrentUser, db: Database):
    return svc.measurement_output(svc.owned(db, m.Measurement, user, measurement_id))


@router.post("/measurements", response_model=s.MeasurementOutput, status_code=201)
def create_measurement(payload: s.MeasurementInput, user: CurrentUser, db: Database):
    return commit(db, svc.save_measurement(db, user, payload), svc.measurement_output)


@router.put("/measurements/{measurement_id}", response_model=s.MeasurementOutput)
def update_measurement(
    measurement_id: UUID, payload: s.MeasurementUpdate, user: CurrentUser, db: Database
):
    item = svc.owned(db, m.Measurement, user, measurement_id)
    return commit(db, svc.save_measurement(db, user, payload, item), svc.measurement_output)


@router.put("/measurements/{measurement_id}/archive", response_model=s.MeasurementOutput)
def archive_measurement(measurement_id: UUID, payload: s.Archive, user: CurrentUser, db: Database):
    return commit(
        db, svc.archive(db, user, m.Measurement, measurement_id, payload), svc.measurement_output
    )


@router.get("/statistics", response_model=s.Statistics)
def statistics(
    user: CurrentUser,
    db: Database,
    since: date | None = None,
    until: date | None = None,
    exercise_id: str | None = Query(None, max_length=100),
    workout_id: UUID | None = None,
    baseline_id: UUID | None = None,
):
    """Période UTC inclusive (un an par défaut, dix ans maximum), résultats terminés."""
    return svc.statistics(
        db,
        user,
        since or utcnow().date() - timedelta(days=365),
        until or utcnow().date(),
        exercise_id,
        workout_id,
        baseline_id,
    )
