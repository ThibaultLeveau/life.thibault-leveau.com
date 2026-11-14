"""Versioned, local French catalogue; no runtime requests or per-account seed writes."""

import json
from pathlib import Path
from unicodedata import normalize

from life_app.apps.sport.schemas import ExerciseOutput

CATALOGUE = tuple(
    ExerciseOutput(**row)
    for row in json.loads(Path(__file__).with_name("catalogue.json").read_text(encoding="utf-8"))
)
BY_ID = {exercise.id: exercise for exercise in CATALOGUE}


def searchable(value: str) -> str:
    return "".join(c for c in normalize("NFKD", value.casefold()) if not 0x300 <= ord(c) <= 0x36F)
