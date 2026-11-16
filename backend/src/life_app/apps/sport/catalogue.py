"""Stable default exercises and localized text; no runtime requests or seed writes."""

import json
from pathlib import Path
from unicodedata import normalize

from life_app.apps.sport.schemas import ExerciseOutput
from life_app.core.i18n import locale

DATA = json.loads(Path(__file__).with_name("catalogue.json").read_text(encoding="utf-8"))
TEXTS = {
    language: json.loads(
        (Path(__file__).parent / "locales" / f"exercises.{language}.json").read_text(
            encoding="utf-8"
        )
    )
    for language in ("fr", "en")
}
for language, texts in TEXTS.items():
    if set(texts["exercises"]) != {row["id"] for row in DATA}:
        raise ValueError(f"Incomplete default exercise catalogue: {language}")
CATALOGUES = {
    language: tuple(
        ExerciseOutput(
            **row,
            **texts["exercises"][row["id"]],
            muscle_group=texts["muscles"][row["muscle_id"]],
            equipment=texts["equipment"][row["equipment_id"]],
        )
        for row in DATA
    )
    for language, texts in TEXTS.items()
}
CATALOGUE = CATALOGUES["fr"]
BY_ID = {exercise.id: exercise for exercise in CATALOGUE}
LOCALIZED_BY_ID = {lang: {e.id: e for e in items} for lang, items in CATALOGUES.items()}


def catalogue():
    return CATALOGUES[locale()]


def default_exercise(id: str):
    return LOCALIZED_BY_ID[locale()][id]


def localized_snapshot(entry: dict) -> dict:
    """Copy only for presentation: never mutate a SQL JSONB historical snapshot."""
    if entry["exercise_id"] in BY_ID:
        return {**entry, "name": default_exercise(entry["exercise_id"]).name}
    return dict(entry)


def searchable(value: str) -> str:
    return "".join(c for c in normalize("NFKD", value.casefold()) if not 0x300 <= ord(c) <= 0x36F)
