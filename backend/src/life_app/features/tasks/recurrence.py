"""Calendar-only recurrence rules. No scheduler: completion advances the same task."""

import re
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from itertools import islice
from math import gcd
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil.rrule import rrulestr
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
DAY_NAMES = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")


def validate_rule(value: str) -> str:
    rule = value.strip().upper().removeprefix("RRULE:")
    parts = {}
    for part in rule.split(";"):
        key, separator, content = part.partition("=")
        if not separator or key in parts or not content:
            raise ValueError("Règle de récurrence invalide ou champ répété.")
        parts[key] = content
    frequency = parts.get("FREQ")
    if frequency not in {"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}:
        raise ValueError("Choisissez une fréquence par jour, semaine, mois ou année.")
    for key, content in parts.items():
        if key == "FREQ":
            continue
        if key == "INTERVAL":
            if not content.isdigit() or not 1 <= int(content) <= 1000:
                raise ValueError("L’intervalle doit être compris entre 1 et 1000.")
        elif key == "WKST":
            if content not in WEEKDAYS:
                raise ValueError("Premier jour de semaine invalide.")
        elif key == "BYDAY":
            for day in content.split(","):
                match = re.fullmatch(r"([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)", day)
                if not match or (
                    match[1]
                    and (
                        int(match[1]) == 0
                        or abs(int(match[1])) > (5 if frequency == "MONTHLY" else 53)
                        or frequency not in {"MONTHLY", "YEARLY"}
                        or "BYWEEKNO" in parts
                    )
                ):
                    raise ValueError("Jour ou position de semaine invalide.")
        elif key in {"BYMONTHDAY", "BYMONTH", "BYSETPOS", "BYYEARDAY", "BYWEEKNO"}:
            maximum = {
                "BYMONTHDAY": 31,
                "BYMONTH": 12,
                "BYSETPOS": 366,
                "BYYEARDAY": 366,
                "BYWEEKNO": 53,
            }[key]
            for number in content.split(","):
                if not re.fullmatch(r"[+-]?\d{1,3}", number):
                    raise ValueError("Les sélections calendaires doivent être des entiers.")
                if not 0 < abs(int(number)) <= maximum or (key == "BYMONTH" and int(number) < 0):
                    raise ValueError("Sélection calendaire hors limites.")
            if key in {"BYYEARDAY", "BYWEEKNO"} and frequency != "YEARLY":
                raise ValueError("Les jours de l’année et numéros de semaine exigent une année.")
            if key == "BYMONTHDAY" and frequency == "WEEKLY":
                raise ValueError("Les jours du mois exigent une autre fréquence que la semaine.")
        else:
            raise ValueError(f"Champ {key} non pris en charge. Réglez la fin séparément.")
    if "BYSETPOS" in parts and not any(k.startswith("BY") and k != "BYSETPOS" for k in parts):
        raise ValueError("Une position exige une sélection de jours ou de mois.")
    if "BYSETPOS" in parts:
        capacity = {"DAILY": 1, "WEEKLY": 7, "MONTHLY": 31, "YEARLY": 366}[frequency]
        if all(abs(int(position)) > capacity for position in parts["BYSETPOS"].split(",")):
            raise ValueError("Cette position n’existe pas dans la période choisie.")
    # Canonical order makes equivalent edits stable and keeps the anchor intact.
    return ";".join(f"{key}={parts[key]}" for key in sorted(parts, key=lambda k: (k != "FREQ", k)))


class Recurrence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rrule: str = Field(
        min_length=1, max_length=512, description="RRULE calendaire sans COUNT/UNTIL."
    )
    start_date: date = Field(description="Ancre du calendrier, indépendante d’un report ponctuel.")
    timezone: str = Field(default="Europe/Paris", max_length=100, description="Fuseau IANA.")
    mode: Literal["scheduled", "completion"] = "scheduled"
    end_date: date | None = Field(default=None, description="Dernier jour autorisé, inclus.")
    max_occurrences: int | None = Field(
        default=None, ge=1, le=10000, description="Nombre de résolutions, première comprise."
    )
    excluded_dates: list[date] = Field(default_factory=list, max_length=366)

    _rule = field_validator("rrule")(validate_rule)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Fuseau horaire IANA inconnu.") from error
        return value

    @model_validator(mode="after")
    def validate_calendar(self):
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("La fin doit suivre le début de la récurrence.")
        if self.end_date is not None and self.max_occurrences is not None:
            raise ValueError("Choisissez une fin par date ou par nombre d’occurrences.")
        if self.mode == "completion" and any(
            part.split("=")[0] not in {"FREQ", "INTERVAL"} for part in self.rrule.split(";")
        ):
            raise ValueError("Après résolution : utilisez un simple intervalle, sans jours fixes.")
        self.excluded_dates = sorted(set(self.excluded_dates))
        return self


def dates(
    rule: Recurrence,
    after: date,
    *,
    inclusive=False,
    limit=6,
    completed=0,
    anchor: date | None = None,
) -> list[date]:
    """Bounded output, no caching or expansion of a whole recurrence into memory.

    RFC 5545 skips impossible dates (31 February), including in completion mode.
    The calendar domain is date.min..date.max; dateutil stops at year 9999.
    """
    remaining = (
        limit if rule.max_occurrences is None else min(limit, rule.max_occurrences - completed)
    )
    if remaining <= 0:
        return []
    start = anchor or rule.start_date
    parts = dict(part.split("=") for part in rule.rrule.split(";"))
    frequency, interval = parts["FREQ"], int(parts.get("INTERVAL", "1"))
    if "BYMONTHDAY" in parts:
        months = [
            int(month)
            for month in parts.get("BYMONTH", ",".join(map(str, range(1, 13)))).split(",")
        ]
        month_days = [abs(int(day)) for day in parts["BYMONTHDAY"].split(",")]
        if not any(day <= monthrange(2000, month)[1] for day in month_days for month in months):
            return []
    if (
        frequency == "DAILY"
        and interval % 7 == 0
        and "BYDAY" in parts
        and WEEKDAYS[start.weekday()] not in parts["BYDAY"].split(",")
    ):
        return []
    # Fast-forward days/weeks without changing their phase. Leave a full weekly
    # interval before the target to retain BYDAY dates earlier in that week.
    if frequency in {"DAILY", "WEEKLY"}:
        step = interval * (7 if frequency == "WEEKLY" else 1)
        jumps = max(0, (after - start).days // step - (frequency == "WEEKLY"))
        start += timedelta(days=jumps * step)
    # An impossible rule must not scan millions of days on each live keystroke.
    # Gregorian patterns repeat after 400 years, adjusted for the interval phase.
    baseline = max(start, after)
    if frequency in {"DAILY", "WEEKLY"}:
        period = 146097 if frequency == "DAILY" else 20871
        cycle = period * interval // gcd(period, interval)
        if frequency == "WEEKLY":
            cycle *= 7
        horizon = baseline + timedelta(days=min(cycle, (date.max - baseline).days))
    else:
        period = 4800 if frequency == "MONTHLY" else 400
        years = (period * interval // gcd(period, interval)) // (
            12 if frequency == "MONTHLY" else 1
        )
        horizon = date(min(9999, baseline.year + years + 1), 12, 31)
    if rule.end_date:
        horizon = min(horizon, rule.end_date)
    base = rule.rrule + (";WKST=MO" if "WKST=" not in rule.rrule else "")
    boundary = datetime.combine(after, time.min)

    def calendar(until):
        suffix = f";UNTIL={until.year:04d}{until.month:02d}{until.day:02d}T235959" if until else ""
        return rrulestr(base + suffix, dtstart=datetime.combine(start, time.min))

    if calendar(horizon).after(boundary, inc=inclusive) is None:
        return []
    recurrence = calendar(rule.end_date)
    excluded = set(rule.excluded_dates)
    candidates = recurrence.xafter(datetime.combine(after, time.min), inc=inclusive)
    result = []
    try:
        # At most 366 exclusions, plus the requested output, can be examined.
        for value in islice(candidates, remaining + len(excluded)):
            day = value.date()
            if rule.end_date and day > rule.end_date:
                break
            if day not in excluded:
                result.append(day)
                if len(result) == remaining:
                    break
    except (ValueError, OverflowError):
        # No representable date remains at the end of the calendar.
        pass
    return result


def next_due(rule: Recurrence, due: date, now: datetime, completed: int) -> date | None:
    today = now.astimezone(ZoneInfo(rule.timezone)).date()
    after = max(due, today) if rule.mode == "scheduled" else today
    result = dates(
        rule,
        after,
        limit=1,
        completed=completed,
        anchor=after if rule.mode == "completion" else None,
    )
    return result[0] if result else None


def describe(rule: Recurrence) -> str:
    parts = dict(part.split("=") for part in rule.rrule.split(";"))
    interval = int(parts.get("INTERVAL", "1"))
    frequency = parts["FREQ"]
    singular, plural = {
        "DAILY": ("jour", "jours"),
        "WEEKLY": ("semaine", "semaines"),
        "MONTHLY": ("mois", "mois"),
        "YEARLY": ("année", "ans"),
    }[frequency]
    label = f"Tous les {interval} {plural}" if interval != 1 else f"Chaque {singular}"
    byday = parts.get("BYDAY", "")
    working_day = byday == "MO,TU,WE,TH,FR" and parts.get("BYSETPOS") == "-1"
    if working_day:
        label += " · dernier jour ouvré"
    elif byday and all(day in WEEKDAYS for day in byday.split(",")):
        names = [DAY_NAMES[WEEKDAYS.index(day)] for day in byday.split(",")]
        label += " · " + ", ".join(names)
    elif byday:
        label += " · " + ", ".join(
            ("dernier" if day[:-2] == "-1" else f"{day[:-2]}ᵉ")
            + " "
            + DAY_NAMES[WEEKDAYS.index(day[-2:])]
            for day in byday.split(",")
        )
    if "BYMONTHDAY" in parts:
        label += " · " + ", ".join(
            "dernier jour" if d == "-1" else f"jour {d}" for d in parts["BYMONTHDAY"].split(",")
        )
    if "BYMONTH" in parts:
        months = (
            "janvier",
            "février",
            "mars",
            "avril",
            "mai",
            "juin",
            "juillet",
            "août",
            "septembre",
            "octobre",
            "novembre",
            "décembre",
        )
        label += " · " + ", ".join(months[int(m) - 1] for m in parts["BYMONTH"].split(","))
    if "BYSETPOS" in parts and not working_day:
        label += " · position " + parts["BYSETPOS"]
    if "BYYEARDAY" in parts or "BYWEEKNO" in parts:
        label += " · calendrier personnalisé"
    if rule.mode == "completion":
        label += " après résolution"
    if rule.end_date:
        label += " · jusqu’au " + rule.end_date.strftime("%d/%m/%Y")
    if rule.max_occurrences:
        label += f" · {rule.max_occurrences} occurrence(s)"
    if rule.excluded_dates:
        label += f" · {len(rule.excluded_dates)} date(s) exclue(s)"
    return label
