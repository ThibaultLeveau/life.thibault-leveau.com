"""Server-owned measurement contracts and transparent, non-medical comparison metrics."""

from fastapi import HTTPException

from life_app.apps.sport.messages import tr
from life_app.apps.sport.schemas import KindDefinition, Values

FIELDS = {
    "weight_kg": [0, 2000, 0.5],
    "reps": [1, 100000, 1],
    "assistance_kg": [0, 500, 0.5],
    "duration_seconds": [0.1, 604800, 1],
    "distance_m": [0.1, 10000000, 1],
    "calories": [0.1, 100000, 1],
}
SPECS = {
    "weight_reps": ["weight_kg", "reps"],
    "reps": ["reps"],
    "assisted_reps": ["assistance_kg", "reps"],
    "duration": ["duration_seconds"],
    "distance_duration": ["distance_m", "duration_seconds"],
    "weight_distance": ["weight_kg", "distance_m"],
    "weight_duration": ["weight_kg", "duration_seconds"],
    "reps_duration": ["reps", "duration_seconds"],
    "distance": ["distance_m"],
    "calories_duration": ["calories", "duration_seconds"],
}


def kind_definitions(language=None):
    return {
        id: KindDefinition(
            id=id,
            name=tr(f"kind_{id}_name", language=language),
            fields=[
                dict(
                    key=key,
                    label=tr(f"field_{key}_label", language=language),
                    unit=tr(f"field_{key}_unit", language=language),
                    minimum=FIELDS[key][0],
                    maximum=FIELDS[key][1],
                    step=FIELDS[key][2],
                )
                for key in fields
            ],
            metric=tr(f"kind_{id}_metric", language=language),
            metric_unit=tr(f"kind_{id}_unit", language=language),
        )
        for id, fields in SPECS.items()
    }


# Stable canonical measurement contracts used for stored metrics and validation.
KINDS = kind_definitions("fr")


def validate_values(kind: str, values: Values, *, complete: bool = False):
    allowed = {field.key for field in KINDS[kind].fields}
    supplied = {key for key, value in values.model_dump().items() if value is not None}
    if supplied - allowed:
        raise HTTPException(422, tr("these_measurements_do_not_match_the_exercise_type"))
    if complete and supplied != allowed:
        raise HTTPException(422, tr("enter_all_measurements_for_this_set"))
    return values.model_dump(exclude_none=True)


def performance(kind: str, values: list[dict]) -> float:
    def total(field):
        return sum(item.get(field, 0) for item in values)

    match kind:
        case "weight_reps":
            return sum((v["weight_kg"] + 1) * v["reps"] for v in values)
        case "assisted_reps":
            return sum(v["reps"] / (v["assistance_kg"] + 1) for v in values)
        case "weight_distance":
            return sum((v["weight_kg"] + 1) * v["distance_m"] for v in values)
        case "weight_duration":
            return sum((v["weight_kg"] + 1) * v["duration_seconds"] for v in values)
        case "distance_duration":
            return total("distance_m") / duration if (duration := total("duration_seconds")) else 0
        case "reps_duration":
            return 60 * total("reps") / duration if (duration := total("duration_seconds")) else 0
        case "calories_duration":
            return (
                60 * total("calories") / duration if (duration := total("duration_seconds")) else 0
            )
        case "duration":
            return total("duration_seconds")
        case "distance":
            return total("distance_m")
        case _:
            return total("reps")
