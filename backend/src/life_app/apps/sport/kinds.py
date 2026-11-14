"""Server-owned measurement contracts and transparent, non-medical comparison metrics."""

from fastapi import HTTPException

from life_app.apps.sport.schemas import KindDefinition, Values

FIELDS = {
    "weight_kg": ("Charge totale", "kg", 0, 2000, 0.5),
    "reps": ("Répétitions", "rép.", 1, 100000, 1),
    "assistance_kg": ("Assistance", "kg", 0, 500, 0.5),
    "duration_seconds": ("Durée", "s", 0.1, 604800, 1),
    "distance_m": ("Distance", "m", 0.1, 10000000, 1),
    "calories": ("Énergie affichée", "kcal", 0.1, 100000, 1),
}
SPECS = [
    (
        "weight_reps",
        "Charge et répétitions",
        ["weight_kg", "reps"],
        "Somme de (charge + 1) × répétitions",
        "points",
    ),
    ("reps", "Poids du corps / répétitions", ["reps"], "Nombre total de répétitions", "rép."),
    (
        "assisted_reps",
        "Répétitions avec assistance",
        ["assistance_kg", "reps"],
        "Somme des répétitions / (assistance + 1)",
        "points",
    ),
    ("duration", "Maintien / durée", ["duration_seconds"], "Durée totale", "s"),
    (
        "distance_duration",
        "Distance et durée",
        ["distance_m", "duration_seconds"],
        "Vitesse moyenne : distance totale / durée totale",
        "m/s",
    ),
    (
        "weight_distance",
        "Charge et distance",
        ["weight_kg", "distance_m"],
        "Somme de (charge + 1) × distance",
        "points",
    ),
    (
        "weight_duration",
        "Charge et durée",
        ["weight_kg", "duration_seconds"],
        "Somme de (charge + 1) × durée",
        "points",
    ),
    (
        "reps_duration",
        "Répétitions chronométrées",
        ["reps", "duration_seconds"],
        "Répétitions par minute",
        "rép./min",
    ),
    ("distance", "Distance seule", ["distance_m"], "Distance totale", "m"),
    (
        "calories_duration",
        "Énergie machine et durée",
        ["calories", "duration_seconds"],
        "Énergie affichée par minute",
        "kcal/min",
    ),
]
KINDS = {
    id: KindDefinition(
        id=id,
        name=name,
        fields=[
            dict(
                key=k,
                label=FIELDS[k][0],
                unit=FIELDS[k][1],
                minimum=FIELDS[k][2],
                maximum=FIELDS[k][3],
                step=FIELDS[k][4],
            )
            for k in fields
        ],
        metric=metric,
        metric_unit=unit,
    )
    for id, name, fields, metric, unit in SPECS
}


def validate_values(kind: str, values: Values, *, complete: bool = False):
    allowed = {field.key for field in KINDS[kind].fields}
    supplied = {key for key, value in values.model_dump().items() if value is not None}
    if supplied - allowed:
        raise HTTPException(422, "Ces mesures ne correspondent pas au type d’exercice.")
    if complete and supplied != allowed:
        raise HTTPException(422, "Renseignez toutes les mesures de cette série.")
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
            return total("distance_m") / total("duration_seconds")
        case "reps_duration":
            return 60 * total("reps") / total("duration_seconds")
        case "calories_duration":
            return 60 * total("calories") / total("duration_seconds")
        case "duration":
            return total("duration_seconds")
        case "distance":
            return total("distance_m")
        case _:
            return total("reps")
