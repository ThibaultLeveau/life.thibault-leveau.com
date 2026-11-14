"""Deterministic French scheduling, shared by live input and API clients."""

import re
import unicodedata
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from life_app.features.tasks.recurrence import DAY_NAMES, WEEKDAYS, Recurrence, dates, describe

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
DAYS = "|".join(DAY_NAMES)
MONTH_PATTERN = "|".join(MONTHS)
DATE_PATTERN = (
    r"(?:apres[- ]demain|aujourd['’]hui|demain|ce soir|ce matin"
    r"|la semaine prochaine|le mois prochain"
    rf"|dans (?:\d{{1,3}}|un|une) (?:jours?|semaines?|mois|ans?)"
    rf"|(?:{DAYS})(?: prochain)?|\d{{4}}-\d{{2}}-\d{{2}}"
    rf"|\d{{1,2}}/\d{{1,2}}(?:/\d{{4}})?"
    rf"|\d{{1,2}}(?:er)? (?:{MONTH_PATTERN})(?: \d{{4}})?)"
)
PREFIX = r"(?:tous les|toutes les|chaque|tous|toutes)"
ORDINALS = {
    "premier": 1,
    "premiere": 1,
    "1er": 1,
    "1ere": 1,
    "deuxieme": 2,
    "2e": 2,
    "troisieme": 3,
    "3e": 3,
    "quatrieme": 4,
    "4e": 4,
    "cinquieme": 5,
    "5e": 5,
    "dernier": -1,
    "derniere": -1,
}
ORDINAL_PATTERN = "|".join(ORDINALS)
RECURRENCE_PATTERNS = [
    rf"{PREFIX} (?:(?P<month_interval>\d{{1,3}}) )?mois (?:le|les) "
    r"(?P<month_dates>\d{1,2}(?:er)?(?:(?:, ?| et )\d{1,2})*)",
    rf"{PREFIX} (?P<ordinal>{ORDINAL_PATTERN}) (?P<ordinal_day>{DAYS})(?:s)?"
    r"(?: (?:du|de chaque) mois)?",
    rf"{PREFIX} (?P<last>dernier) jour(?: (?:du|de chaque) mois)?",
    rf"{PREFIX} (?P<work>jours? (?:ouvres|ouvrables))",
    rf"{PREFIX} (?P<weekdays>(?:{DAYS})s?(?:(?:, ?| et | & )(?:{DAYS})s?)*)",
    rf"{PREFIX} (?P<monthdays>\d{{1,2}}(?:er)?(?:(?:, ?| et )\d{{1,2}})*) (?:du|de chaque) mois",
    rf"{PREFIX} (?P<annual_day>\d{{1,2}})(?:er)? (?P<annual_month>{MONTH_PATTERN})",
    rf"{PREFIX} (?:(?P<interval>\d{{1,3}}) )?(?P<unit>jours?|semaines?|mois|ans?|annees?)"
    rf"(?: (?:le |les )?(?P<interval_days>(?:{DAYS})s?(?:(?:, ?| et )(?:{DAYS})s?)*))?",
    r"(?P<adjective>quotidiennement|quotidien|hebdomadaire|mensuel|annuel)",
]


def normalize(text: str) -> str:
    # One code point per original character for French accents; offsets remain usable.
    return "".join(
        "".join(
            c for c in unicodedata.normalize("NFD", char.lower()) if not unicodedata.combining(c)
        )
        for char in text
    )


def parse_date(text: str, today: date) -> date | None:
    value = normalize(text.strip())
    try:
        if value in {"aujourd'hui", "aujourd’hui", "ce soir", "ce matin"}:
            return today
        if value == "la semaine prochaine":
            return today + timedelta(days=(7 - today.weekday()))
        if value == "le mois prochain":
            return today.replace(day=1) + relativedelta(months=1)
        if value in {"demain", "apres-demain", "apres demain"}:
            return today + timedelta(days=1 if value == "demain" else 2)
        match = re.fullmatch(r"dans (\d+|un|une) (jours?|semaines?|mois|ans?)", value)
        if match:
            unit = {"jour": "days", "semaine": "weeks", "moi": "months", "an": "years"}[
                match[2].rstrip("s")
            ]
            return today + relativedelta(
                **{unit: 1 if match[1] in {"un", "une"} else int(match[1])}
            )
        match = re.fullmatch(rf"({DAYS})( prochain)?", value)
        if match:
            delta = (DAY_NAMES.index(match[1]) - today.weekday()) % 7
            return today + timedelta(days=delta or 7)
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return date.fromisoformat(value)
        match = re.fullmatch(r"(\d{1,2})/(\d{1,2})(?:/(\d{4}))?", value)
        if match:
            day, month, year = int(match[1]), int(match[2]), match[3]
        else:
            match = re.fullmatch(rf"(\d{{1,2}})(?:er)? ({MONTH_PATTERN})(?: (\d{{4}}))?", value)
            if not match:
                return None
            day, month, year = int(match[1]), MONTHS.index(match[2]) + 1, match[3]
        if year:
            return date(int(year), month, day)
        for candidate_year in range(today.year, min(today.year + 9, 10000)):
            try:
                candidate = date(candidate_year, month, day)
            except ValueError:
                continue
            if candidate >= today:
                return candidate
    except (ValueError, OverflowError):
        return None
    return None


def rule_from_match(match) -> str:
    group = match.groupdict()
    if group.get("month_dates"):
        days = ",".join(re.findall(r"\d+", group["month_dates"]))
        return f"FREQ=MONTHLY;INTERVAL={group.get('month_interval') or 1};BYMONTHDAY={days}"
    if group.get("ordinal"):
        day = WEEKDAYS[DAY_NAMES.index(group["ordinal_day"])]
        return f"FREQ=MONTHLY;BYDAY={ORDINALS[group['ordinal']]}{day}"
    if group.get("last"):
        return "FREQ=MONTHLY;BYMONTHDAY=-1"
    if group.get("work"):
        return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
    if group.get("weekdays"):
        days = re.findall(DAYS, group["weekdays"])
        return "FREQ=WEEKLY;BYDAY=" + ",".join(WEEKDAYS[DAY_NAMES.index(d)] for d in days)
    if group.get("monthdays"):
        return "FREQ=MONTHLY;BYMONTHDAY=" + ",".join(re.findall(r"\d+", group["monthdays"]))
    if group.get("annual_day"):
        return (
            f"FREQ=YEARLY;BYMONTH={MONTHS.index(group['annual_month']) + 1}"
            f";BYMONTHDAY={group['annual_day']}"
        )
    if group.get("adjective"):
        return (
            "FREQ="
            + {
                "quotidiennement": "DAILY",
                "quotidien": "DAILY",
                "hebdomadaire": "WEEKLY",
                "mensuel": "MONTHLY",
                "annuel": "YEARLY",
            }[group["adjective"]]
        )
    unit = group["unit"]
    frequency = (
        "DAILY"
        if unit.startswith("jour")
        else "WEEKLY"
        if unit.startswith("semaine")
        else "MONTHLY"
        if unit == "mois"
        else "YEARLY"
    )
    rule = f"FREQ={frequency};INTERVAL={group.get('interval') or 1}"
    if group.get("interval_days"):
        days = re.findall(DAYS, group["interval_days"])
        rule += ";BYDAY=" + ",".join(WEEKDAYS[DAY_NAMES.index(d)] for d in days)
    return rule


def parse_schedule(text: str, today: date, timezone: str) -> dict:
    normalized_parts, starts, ends = [], [], []
    for index, char in enumerate(text):
        part = normalize(char)
        normalized_parts.append(part)
        starts.extend([index] * len(part))
        ends.extend([index + 1] * len(part))
        if not part and ends:
            ends[-1] = index + 1
    normalized = "".join(normalized_parts)
    # Quoted dates are literal text. No NLP call ever modifies or saves a task.
    quoted = [m.span() for m in re.finditer(r'"[^"\n]*"|«[^»\n]*»', normalized)]
    matches = []
    for pattern in RECURRENCE_PATTERNS:
        for match in re.finditer(rf"(?<!\w)(?:{pattern})(?!\w)", normalized):
            matches.append((match, True))
    # A date embedded in an unrecognised recurrence must not become a one-off date.
    if not matches and not re.search(rf"\b{PREFIX}\b", normalized):
        matches = [(m, False) for m in re.finditer(rf"(?<!\w){DATE_PATTERN}(?!\w)", normalized)]
    matches.sort(key=lambda pair: (-(pair[0].end() - pair[0].start()), -pair[0].start()))
    for match, recurring in matches:
        begin, end = match.span()
        if any(begin < right and end > left for left, right in quoted):
            continue
        recurrence = None
        if recurring:
            start, until, count, mode = today, None, None, "scheduled"
            invalid = False
            tail = normalized[end:]
            # Modifiers can be combined, in either order. Consume only recognised text.
            for _ in range(4):
                modifier = re.match(
                    rf" (?:a partir de|des|a compter de) (?P<start>{DATE_PATTERN})(?!\w)", tail
                )
                end_modifier = re.match(rf" jusqu['’](?:au|a) (?P<end>{DATE_PATTERN})(?!\w)", tail)
                count_modifier = re.match(
                    r" (?:pendant |pour )?(\d{1,4}) (?:fois|occurrences?)(?!\w)", tail
                )
                mode_modifier = re.match(
                    r" apres (?:resolution|realisation|chaque resolution)(?!\w)", tail
                )
                found = modifier or end_modifier or count_modifier or mode_modifier
                if not found:
                    invalid = bool(
                        re.match(r" (?:a partir de|des |jusqu|pendant|pour \d|apres resol)", tail)
                    )
                    break
                if modifier:
                    start = parse_date(modifier["start"], today)
                    invalid = start is None
                elif end_modifier:
                    until = parse_date(end_modifier["end"], today)
                    invalid = until is None
                elif count_modifier:
                    count = int(count_modifier[1])
                else:
                    mode = "completion"
                end += found.end()
                tail = tail[found.end() :]
                if invalid:
                    break
            if invalid:
                continue
            try:
                recurrence = Recurrence(
                    rrule=rule_from_match(match),
                    start_date=start,
                    timezone=timezone,
                    end_date=until,
                    max_occurrences=count,
                    mode=mode,
                )
                upcoming = dates(recurrence, recurrence.start_date, inclusive=True)
            except (ValueError, TypeError):
                continue
            if not upcoming:
                continue
            due = upcoming[0]
        else:
            due = parse_date(match[0], today)
            if due is None:
                continue
            upcoming = [due]
        begin, end = starts[begin], ends[end - 1]
        title = re.sub(r"\s+", " ", text[:begin] + " " + text[end:]).strip(" ,;–-")
        return {
            "title": title,
            "due_date": due,
            "recurrence": recurrence,
            "matched_text": text[begin:end],
            "start": begin,
            "end": end,
            "label": describe(recurrence) if recurrence else due.strftime("%d/%m/%Y"),
            "dates": upcoming,
        }
    return {
        "title": text,
        "due_date": None,
        "recurrence": None,
        "matched_text": None,
        "start": None,
        "end": None,
        "label": None,
        "dates": [],
    }
