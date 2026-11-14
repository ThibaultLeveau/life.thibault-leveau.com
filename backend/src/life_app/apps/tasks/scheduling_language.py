"""French calendar vocabulary and readers, with offsets into the untouched title."""

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from life_app.apps.tasks.recurrence import DAY_NAMES

MONTHS = (
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
)
SMALL = dict(
    zip(
        (
            "zero",
            "un",
            "deux",
            "trois",
            "quatre",
            "cinq",
            "six",
            "sept",
            "huit",
            "neuf",
            "dix",
            "onze",
            "douze",
            "treize",
            "quatorze",
            "quinze",
            "seize",
        ),
        range(17),
        strict=True,
    )
) | {"une": 1}
TENS = {
    "vingt": 20,
    "trente": 30,
    "quarante": 40,
    "cinquante": 50,
    "soixante": 60,
    "septante": 70,
    "huitante": 80,
    "octante": 80,
    "nonante": 90,
}
UNITS = {
    "jour": ("DAILY", 1),
    "semaine": ("WEEKLY", 1),
    "quinzaine": ("WEEKLY", 2),
    "mois": ("MONTHLY", 1),
    "trimestre": ("MONTHLY", 3),
    "semestre": ("MONTHLY", 6),
    "an": ("YEARLY", 1),
    "annee": ("YEARLY", 1),
}
ALIASES = {
    "quotidien": ("DAILY", 1),
    "quotidienne": ("DAILY", 1),
    "quotidiennement": ("DAILY", 1),
    "hebdomadaire": ("WEEKLY", 1),
    "hebdomadairement": ("WEEKLY", 1),
    "mensuel": ("MONTHLY", 1),
    "mensuelle": ("MONTHLY", 1),
    "mensuellement": ("MONTHLY", 1),
    "bimestriel": ("MONTHLY", 2),
    "bimestrielle": ("MONTHLY", 2),
    "trimestriel": ("MONTHLY", 3),
    "trimestrielle": ("MONTHLY", 3),
    "semestriel": ("MONTHLY", 6),
    "semestrielle": ("MONTHLY", 6),
    "annuel": ("YEARLY", 1),
    "annuelle": ("YEARLY", 1),
    "annuellement": ("YEARLY", 1),
}


@dataclass(frozen=True)
class Token:
    value: str
    start: int
    end: int


def normalize(text: str) -> str:
    return (
        "".join(
            c for c in unicodedata.normalize("NFD", text.lower()) if not unicodedata.combining(c)
        )
        .replace("œ", "oe")
        .replace("’", "'")
    )


def tokenize(text: str) -> list[Token]:
    characters, starts, ends = [], [], []
    for index, character in enumerate(text):
        part = normalize(character)
        characters.append(part)
        starts.extend([index] * len(part))
        ends.extend([index + 1] * len(part))
        if not part and ends:
            ends[-1] = index + 1
    normalized = "".join(characters)
    # Hyphenated French numbers/words and NBSP share the same grammar. ISO dates stay whole.
    normalized = re.sub(r"(?<=[a-z])[-‑–](?=[a-z])", " ", normalized)
    pattern = (
        r"\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{4})?|\d+(?:ieme|eme|ere|er|e|ᵉ)?|[a-z]+|[^\s]"
    )
    return [
        Token(m[0], starts[m.start()], ends[m.end() - 1]) for m in re.finditer(pattern, normalized)
    ]


def word(tokens: list[Token], index: int) -> str:
    return tokens[index].value if index < len(tokens) else ""


def singular(value: str) -> str:
    return value if value == "mois" else value.removesuffix("s")


def unit(tokens, index):
    return UNITS.get(singular(word(tokens, index)))


def number(tokens: list[Token], index: int) -> tuple[int, int] | None:
    """Read a cardinal, not a sum of unrelated words ('deux trois' is not five)."""
    if word(tokens, index).isdecimal():
        return int(word(tokens, index)), index + 1

    def below_hundred(i):
        value = word(tokens, i)
        if value == "quatre" and word(tokens, i + 1) in {"vingt", "vingts"}:
            base, end = 80, i + 2
        elif value in TENS:
            base, end = TENS[value], i + 1
        elif value in SMALL:
            base, end = SMALL[value], i + 1
            if base == 10 and word(tokens, end) in {"sept", "huit", "neuf"}:
                return base + SMALL[word(tokens, end)], end + 1
            return base, end
        else:
            return None
        tail = end + (word(tokens, end) == "et")
        child = below_hundred(tail)
        if child and 0 < child[0] <= (19 if base in {60, 80} else 9):
            if tail == end or child[0] in {1, 11}:
                return base + child[0], child[1]
        return base, end

    def below_thousand(i):
        prefix = below_hundred(i)
        if word(tokens, i) in {"cent", "cents"}:
            base, end = 100, i + 1
        elif prefix and 1 <= prefix[0] <= 9 and word(tokens, prefix[1]) in {"cent", "cents"}:
            base, end = prefix[0] * 100, prefix[1] + 1
        else:
            return prefix
        tail = below_hundred(end)
        return (base + tail[0], tail[1]) if tail and tail[0] else (base, end)

    prefix = below_thousand(index)
    if word(tokens, index) == "mille":
        base, end = 1000, index + 1
    elif prefix and prefix[0] and word(tokens, prefix[1]) == "mille":
        base, end = prefix[0] * 1000, prefix[1] + 1
    else:
        return prefix
    tail = below_thousand(end)
    return (base + tail[0], tail[1]) if tail and tail[0] else (base, end)


def ordinal(tokens: list[Token], index: int) -> tuple[int, int] | None:
    value = singular(word(tokens, index))
    if value in {"dernier", "derniere"}:
        return -1, index + 1
    if value == "avant" and singular(word(tokens, index + 1)) in {"dernier", "derniere"}:
        return -2, index + 2
    if value in {"premier", "premiere", "second", "seconde"}:
        return (1 if value.startswith("prem") else 2), index + 1
    match = re.fullmatch(r"(\d+)(?:ieme|eme|ere|er|e|ᵉ)", value)
    if match:
        return int(match[1]), index + 1
    # Replace the terminal ordinal with its cardinal stem and reuse the number reader.
    for end in range(index, min(len(tokens), index + 12)):
        terminal = singular(word(tokens, end))
        if not terminal.endswith("ieme"):
            continue
        stem = terminal[:-4]
        stem = {"cinqu": "cinq", "neuv": "neuf"}.get(stem, stem)
        if stem not in SMALL | TENS and stem + "e" in SMALL | TENS:
            stem += "e"
        modified = tokens[index:end] + [Token(stem, 0, 0)]
        result = number(modified, 0)
        if result and result[1] == len(modified):
            return result[0], end + 1
    return None


def day_number(tokens, index):
    return ordinal(tokens, index) or number(tokens, index)


def calendar_date(day: int, month: int, year: int | None, today: date) -> date:
    if year is not None:
        return date(year, month, day)
    for candidate in range(today.year, min(today.year + 9, 10000)):
        try:
            result = date(candidate, month, day)
        except ValueError:
            continue
        if result >= today:
            return result
    raise ValueError("Cette date n’existe pas dans le calendrier.")


def read_date(tokens: list[Token], index: int, today: date) -> tuple[date, int] | None:
    """Read a date atom; an invalid explicit date raises instead of matching its suffix."""
    start = index
    if word(tokens, index) in {"le", "la"}:
        index += 1
    elif word(tokens, index) == "l" and word(tokens, index + 1) == "'":
        index += 2
    value = word(tokens, index)
    tail = [t.value for t in tokens[index : index + 4]]
    if value == "demain":
        return today + timedelta(days=1), index + 1
    if tail[:2] == ["apres", "demain"]:
        return today + timedelta(days=2), index + 2
    if tail[:3] == ["aujourd", "'", "hui"]:
        return today, index + 3
    if tail[:2] in (["ce", "soir"], ["ce", "matin"]):
        return today, index + 2
    if value in {"semaine", "mois", "an", "annee"} and singular(word(tokens, index + 1)) in {
        "prochain",
        "prochaine",
    }:
        delta = {
            "semaine": {"days": 7 - today.weekday()},
            "mois": {"months": 1},
            "an": {"years": 1},
            "annee": {"years": 1},
        }[value]
        anchor = (
            today
            if value == "semaine"
            else today.replace(day=1)
            if value == "mois"
            else today.replace(month=1, day=1)
        )
        return anchor + relativedelta(**delta), index + 2
    if value == "dans":
        amount = number(tokens, index + 1)
        if amount and (period := unit(tokens, amount[1])):
            key = {"DAILY": "days", "WEEKLY": "weeks", "MONTHLY": "months", "YEARLY": "years"}[
                period[0]
            ]
            return today + relativedelta(**{key: amount[0] * period[1]}), amount[1] + 1
        return None
    if singular(value) in DAY_NAMES:
        delta = (DAY_NAMES.index(singular(value)) - today.weekday()) % 7 or 7
        end = index + 1 + (word(tokens, index + 1) == "prochain")
        return today + timedelta(days=delta), end
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return date.fromisoformat(value), index + 1
    if "/" in value:
        fields = list(map(int, value.split("/")))
        return calendar_date(
            fields[0], fields[1], fields[2] if len(fields) == 3 else None, today
        ), index + 1
    amount = day_number(tokens, index)
    if amount and word(tokens, amount[1]) in MONTHS:
        end = amount[1] + 1
        year_text = word(tokens, end)
        year = int(year_text) if re.fullmatch(r"\d{4}", year_text) else None
        return calendar_date(
            amount[0], MONTHS.index(word(tokens, amount[1])) + 1, year, today
        ), end + (year is not None)
    # 'le 21' is an explicit one-off date; bare title numbers never are.
    if start != index and amount and 1 <= amount[0] <= 31:
        for step in range(13):
            month = today.replace(day=1) + relativedelta(months=step)
            try:
                result = month.replace(day=amount[0])
            except ValueError:
                continue
            if result >= today:
                return result, amount[1]
    return None
