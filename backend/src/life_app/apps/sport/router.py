from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select

from life_app.apps.sport import models as m
from life_app.apps.sport import schemas as s
from life_app.apps.sport import service as svc
from life_app.apps.sport.kinds import KINDS
from life_app.core.database import Database
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
    return list(KINDS.values())


@router.get("/exercises", response_model=s.ExercisePage)
def exercises(
    user: CurrentUser,
    db: Database,
    q: str = Query("", max_length=160),
    kind: s.Kind | None = None,
    muscle: str = "",
    equipment: str = "",
    archived: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
):
    """Catalogue fourni et exercices personnels ; recherche sans accents, filtres et pagination."""
    return svc.exercises(db, user, q, kind, muscle, equipment, archived, offset, limit)


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
    """Modifier un exercice personnel ; les instantanés des séances et sessions sont conservés."""
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
def update_settings(payload: s.Settings, user: CurrentUser, db: Database):
    """Repos de 0 à 3600 secondes ; s’applique à la prochaine série validée."""
    item = db.get(m.SportSettings, user.id)
    if item is None:
        item = m.SportSettings(owner_id=user.id)
        db.add(item)
    item.rest_seconds = payload.rest_seconds
    db.commit()
    return payload


@router.get("/workouts", response_model=list[s.WorkoutOutput])
def workouts(user: CurrentUser, db: Database, archived: bool = False):
    return db.scalars(
        select(m.Workout)
        .where(
            m.Workout.owner_id == user.id,
            m.Workout.archived_at.is_not(None) if archived else m.Workout.archived_at.is_(None),
        )
        .order_by(m.Workout.updated_at.desc(), m.Workout.id)
    ).all()


@router.get("/workouts/{workout_id}", response_model=s.WorkoutOutput)
def get_workout(workout_id: UUID, user: CurrentUser, db: Database):
    return svc.owned(db, m.Workout, user, workout_id)


@router.post("/workouts", response_model=s.WorkoutOutput, status_code=201)
def create_workout(payload: s.WorkoutInput, user: CurrentUser, db: Database):
    item = m.Workout(
        owner_id=user.id,
        name=payload.name,
        notes=payload.notes,
        entries=svc.snapshot(db, user, payload.entries),
    )
    db.add(item)
    return commit(db, item, s.WorkoutOutput.model_validate)


@router.put("/workouts/{workout_id}", response_model=s.WorkoutOutput)
def update_workout(workout_id: UUID, payload: s.WorkoutUpdate, user: CurrentUser, db: Database):
    """Remplacer nom, notes et exercices ordonnés ; sessions passées ou en cours inchangées."""
    item = svc.owned(db, m.Workout, user, workout_id)
    svc.version(item, payload.expected_version)
    item.name, item.notes = payload.name, payload.notes
    item.entries = svc.snapshot(db, user, payload.entries)
    svc.touch(item)
    return commit(db, item, s.WorkoutOutput.model_validate)


@router.put("/workouts/{workout_id}/archive", response_model=s.WorkoutOutput)
def archive_workout(workout_id: UUID, payload: s.Archive, user: CurrentUser, db: Database):
    return commit(
        db, svc.archive(db, user, m.Workout, workout_id, payload), s.WorkoutOutput.model_validate
    )


@router.get("/sessions", response_model=s.SessionPage)
def sessions(
    user: CurrentUser,
    db: Database,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    return svc.history(db, user, offset, limit)


@router.get("/sessions/active", response_model=s.TrainingOutput | None)
def current_session(user: CurrentUser, db: Database):
    item = db.scalar(
        select(m.Training).where(m.Training.owner_id == user.id, m.Training.status == "active")
    )
    return svc.training_output(item) if item else None


@router.get("/sessions/{session_id}", response_model=s.TrainingOutput)
def get_session(session_id: UUID, user: CurrentUser, db: Database):
    return svc.training_output(svc.owned(db, m.Training, user, session_id))


@router.post("/sessions", response_model=s.TrainingOutput, status_code=201)
def start_session(payload: s.SessionStart, user: CurrentUser, db: Database):
    """Démarrer un instantané ; un seul entraînement actif par compte (409 sinon)."""
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
def stop_rest(session_id: UUID, payload: s.Version, user: CurrentUser, db: Database):
    item = svc.active_session(db, user, session_id, payload.expected_version)
    item.rest_until = None
    svc.touch(item)
    return commit(db, item, svc.training_output)


@router.put("/sessions/{session_id}/finish", response_model=s.TrainingOutput)
def finish_session(session_id: UUID, payload: s.SessionFinish, user: CurrentUser, db: Database):
    """Terminer toutes les séries ou abandonner ; historique ensuite immuable."""
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
    user: CurrentUser, db: Database, since: date | None = None, until: date | None = None
):
    """Période UTC inclusive (un an par défaut, dix ans maximum), résultats terminés."""
    return svc.statistics(
        db, user, since or date.today() - timedelta(days=365), until or date.today()
    )
