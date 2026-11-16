"""English lexical adapter for the shared calendar grammar.

Only recognized calendar tokens are normalized. Every token keeps the original
Unicode source span; user titles and quoted text are never translated or rebuilt.
The grammar's canonical vocabulary is historical French, independent of display locale.
"""

import re

from life_app.apps.tasks.recurrence import DAY_NAMES
from life_app.apps.tasks.scheduling_language import MONTHS, Token, normalize

WEEKDAYS = dict(
    zip(
        ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"),
        DAY_NAMES,
        strict=True,
    )
)
EN_MONTHS = dict(
    zip(
        (
            "january",
            "february",
            "march",
            "april",
            "may",
            "june",
            "july",
            "august",
            "september",
            "october",
            "november",
            "december",
        ),
        MONTHS,
        strict=True,
    )
)
SMALL = dict(
    zip(
        (
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
        ),
        range(20),
        strict=True,
    )
)
TENS = dict(
    zip(
        ("twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"),
        range(20, 100, 10),
        strict=True,
    )
)
ORDINALS = {
    "first": 1,
    "second": 2,
    "third": 3,
    "fourth": 4,
    "fifth": 5,
    "sixth": 6,
    "seventh": 7,
    "eighth": 8,
    "ninth": 9,
    "tenth": 10,
    "eleventh": 11,
    "twelfth": 12,
    "thirteenth": 13,
    "fourteenth": 14,
    "fifteenth": 15,
    "sixteenth": 16,
    "seventeenth": 17,
    "eighteenth": 18,
    "nineteenth": 19,
    "twentieth": 20,
    "thirtieth": 30,
}
VOCABULARY = {
    **{k: [v] for k, v in WEEKDAYS.items()},
    **{k + "s": [v + "s"] for k, v in WEEKDAYS.items()},
    **{k: [v] for k, v in EN_MONTHS.items()},
    "day": ["jour"],
    "days": ["jours"],
    "week": ["semaine"],
    "weeks": ["semaines"],
    "month": ["mois"],
    "months": ["mois"],
    "year": ["an"],
    "years": ["ans"],
    "fortnight": ["quinzaine"],
    "fortnights": ["quinzaines"],
    "quarter": ["trimestre"],
    "quarters": ["trimestres"],
    "daily": ["quotidien"],
    "weekly": ["hebdomadaire"],
    "monthly": ["mensuel"],
    "yearly": ["annuel"],
    "annually": ["annuel"],
    "quarterly": ["trimestriel"],
    "fortnightly": ["toutes", "2", "semaines"],
    "semiannually": ["semestriel"],
    "biweekly": ["bihebdomadaire"],
    "bimonthly": ["bimensuel"],
    "every": ["chaque"],
    "each": ["chaque"],
    "and": ["et"],
    "to": ["au"],
    "through": ["au"],
    "the": ["le"],
    "on": ["le"],
    "of": ["de"],
    "in": ["dans"],
    "for": ["pour"],
    "during": ["pendant"],
    "per": ["par"],
    "times": ["fois"],
    "time": ["fois"],
    "occurrence": ["occurrence"],
    "occurrences": ["occurrences"],
    "except": ["sauf"],
    "excluding": ["sauf"],
    "until": ["jusqu"],
    "starting": ["des"],
    "from": ["du"],
    "after": ["apres"],
    "completion": ["resolution"],
    "tomorrow": ["demain"],
    "yesterday": ["hier"],
    "today": ["aujourd", "'", "hui"],
    "tonight": ["ce", "soir"],
    "weekdays": ["jours", "ouvres"],
    "weekday": ["jour", "ouvre"],
    "weekend": ["weekend"],
    "weekends": ["weekends"],
    "last": ["dernier"],
    "start": ["debut"],
    "end": ["fin"],
    "hour": ["heure"],
    "hours": ["heures"],
    "minute": ["minute"],
    "minutes": ["minutes"],
    "seconds": ["secondes"],
    "holiday": ["ferie"],
    "holidays": ["feries"],
}
PHRASES = {
    ("day", "after", "tomorrow"): ["apres", "demain"],
    ("this", "morning"): ["ce", "matin"],
    ("this", "evening"): ["ce", "soir"],
    ("business", "day"): ["jour", "ouvre"],
    ("business", "days"): ["jours", "ouvres"],
    ("working", "day"): ["jour", "ouvrable"],
    ("working", "days"): ["jours", "ouvrables"],
    ("public", "holidays"): ["jours", "feries"],
    ("starting", "from"): ["des"],
    ("starting", "on"): ["des"],
    ("second", "to", "last"): ["avant", "dernier"],
    ("odd", "weeks"): ["semaines", "impaires"],
    ("even", "weeks"): ["semaines", "paires"],
    ("odd", "months"): ["mois", "impairs"],
    ("even", "months"): ["mois", "pairs"],
    ("week", "numbers"): ["semaines", "numeros"],
    ("at", "the", "start"): ["debut"],
    ("at", "the", "end"): ["fin"],
    ("of", "the"): ["du"],
    ("on", "the"): ["le"],
    ("once", "a"): ["1", "fois", "par"],
    ("once", "per"): ["1", "fois", "par"],
    ("twice", "a"): ["2", "fois", "par"],
    ("twice", "per"): ["2", "fois", "par"],
    ("times", "a"): ["fois", "par"],
    ("in", "january"): ["en", "janvier"],
}
# Specific month scopes must precede the ordinary relative-date 'in'.
PHRASES.update({("in", k): ["en", v] for k, v in EN_MONTHS.items()})


def english_number(tokens: list[Token], index: int):
    """Consume a single cardinal/ordinal with its complete source span."""
    values = [t.value for t in tokens]
    first = values[index]
    match = re.fullmatch(r"(\d+)(st|nd|rd|th)?", first)
    if match:
        return int(match[1]), bool(match[2]), index + 1
    if first in ORDINALS:
        return ORDINALS[first], True, index + 1
    if first not in SMALL and first not in TENS and first not in {"hundred", "thousand"}:
        return None
    total, group, end, ordinal = 0, 0, index, False
    previous = ""
    while end < len(values):
        value = values[end]
        if value in SMALL:
            if previous in SMALL or previous in ORDINALS:
                break
            if previous in TENS and SMALL[value] >= 10:
                break
            group += SMALL[value]
        elif value in TENS:
            if previous in SMALL or previous in TENS:
                break
            group += TENS[value]
        elif value in ORDINALS:
            if previous not in TENS or ORDINALS[value] >= 10:
                break
            group += ORDINALS[value]
            ordinal = True
        elif value == "hundred" and group < 10:
            group = (group or 1) * 100
        elif value == "thousand" and total == 0:
            total, group = (group or 1) * 1000, 0
        elif value == "and" and previous in {"hundred", "thousand"} and end + 1 < len(values):
            if values[end + 1] not in SMALL | TENS:
                break
        else:
            break
        previous = value
        end += 1
        if ordinal:
            break
    return total + group, ordinal, end


def tokenize_english(text: str) -> list[Token]:
    pattern = r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{4})?|\d+(?:st|nd|rd|th)?|[a-z]+|[^\s\-‑–]"
    # English calendar vocabulary is ASCII; match on the original string to retain Unicode indices.
    raw = [
        Token(normalize(m[0]), m.start(), m.end(), m[0].lower())
        for m in re.finditer(pattern, text, re.IGNORECASE)
    ]
    output = []
    index = 0

    def emit(values, end):
        output.extend(
            Token(
                value,
                raw[index].start,
                raw[end - 1].end,
                text[raw[index].start : raw[end - 1].end].lower(),
            )
            for value in values
        )
        return end

    while index < len(raw):
        value = raw[index].value
        found = False
        for phrase, replacement in sorted(PHRASES.items(), key=lambda p: -len(p[0])):
            if tuple(t.value for t in raw[index : index + len(phrase)]) == phrase:
                index = emit(replacement, index + len(phrase))
                found = True
                break
        if found:
            continue
        if value == "every" and index + 1 < len(raw) and raw[index + 1].value == "other":
            if index + 2 < len(raw) and raw[index + 2].value in WEEKDAYS:
                index = emit(["1", WEEKDAYS[raw[index + 2].value], "sur", "2"], index + 3)
            else:
                index = emit(["chaque", "2"], index + 2)
            continue
        if value == "next" and index + 1 < len(raw):
            following = raw[index + 1].value
            if following in WEEKDAYS or following in {"week", "month", "year"}:
                index = emit([*VOCABULARY[following], "prochain"], index + 2)
                continue
        if value in EN_MONTHS and index + 1 < len(raw):
            amount = english_number(raw, index + 1)
            if amount and 1 <= amount[0] <= 31:
                day, _, end = amount
                values = [str(day), EN_MONTHS[value]]
                if end < len(raw) and raw[end].value == ",":
                    end += 1
                if end < len(raw) and re.fullmatch(r"\d{4}", raw[end].value):
                    values.append(raw[end].value)
                    end += 1
                index = emit(values, end)
                continue
        amount = english_number(raw, index)
        if amount:
            number, ordinal, end = amount
            index = emit([str(number) + ("e" if ordinal else "")], end)
            continue
        index = emit(VOCABULARY.get(value, [value]), index + 1)
    return output
