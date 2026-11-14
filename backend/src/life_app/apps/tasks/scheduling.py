"""French scheduling shared by live input, the planner and independent API clients."""

import re
from datetime import date

from pydantic import ValidationError

from life_app.apps.tasks.recurrence import dates, describe
from life_app.apps.tasks.scheduling_grammar import Grammar, ScheduleError
from life_app.apps.tasks.scheduling_language import (
    ALIASES,
    MONTHS,
    number,
    read_date,
    tokenize,
    unit,
    word,
)


def parse_date(text: str, today: date) -> date | None:
    tokens = tokenize(text.strip())
    try:
        result = read_date(tokens, 0, today)
        return result[0] if result and result[1] == len(tokens) else None
    except (ValueError, OverflowError):
        return None


def parse_schedule(text: str, today: date, timezone: str) -> dict:
    tokens = tokenize(text)
    quoted = [m.span() for m in re.finditer(r'"[^"\n]*"|«[^»\n]*»', text)]

    def literal(begin, end):
        return any(begin < right and end > left for left, right in quoted)

    recurring_cue = any(
        (token.value in {"tous", "toutes", "chaque"} or token.value in ALIASES)
        and not literal(token.start, token.end)
        for token in tokens
    )

    empty = {
        "title": text,
        "due_date": None,
        "recurrence": None,
        "matched_text": None,
        "start": None,
        "end": None,
        "label": None,
        "dates": [],
        "status": "none",
        "diagnostic": None,
    }
    found = []
    index = 0
    while index < len(tokens):
        if literal(tokens[index].start, tokens[index].end):
            index += 1
            continue
        if unit(tokens, index) and word(tokens, index + 1) != "sur":
            index += 1
            continue
        amount = number(tokens, index)
        if amount and not (
            unit(tokens, amount[1])
            or word(tokens, amount[1]) in MONTHS
            or word(tokens, amount[1]) in {"fois", "occurrence", "occurrences"}
            or (Grammar.weekday(tokens, amount[1]) and word(tokens, amount[1] + 1) == "sur")
        ):
            index += 1
            continue
        parser = Grammar(tokens, index, today)
        try:
            spec = parser.parse()
            if spec is None:
                if parser.barrier:
                    return empty
                index += 1
                continue
            end = tokens[parser.pos - 1].end
            if literal(tokens[index].start, end):
                index += 1
                continue
            recurrence = spec.compile(today, timezone)
            upcoming = dates(recurrence, recurrence.start_date, inclusive=True)
            if not upcoming:
                raise ScheduleError(
                    "Ces réglages ne donnent aucune date. "
                    "Vérifiez les jours, les exclusions et la fin."
                )
            found.append((index, parser.pos, recurrence, upcoming))
            index = parser.pos
        except (ValueError, OverflowError) as error:
            if not parser.intent and not (parser.directive and recurring_cue):
                index += 1
                continue
            if isinstance(error, ValidationError):
                message = error.errors()[0]["msg"].removeprefix("Value error, ")
            elif isinstance(error, ScheduleError):
                message = str(error)
            else:
                message = (
                    "Une date ou une durée est hors du calendrier. "
                    "Vérifiez les jours, mois et années."
                )
            return empty | {"status": getattr(error, "status", "invalid"), "diagnostic": message}
    if len(found) > 1:
        return empty | {
            "status": "invalid",
            "diagnostic": "Plusieurs récurrences séparées sont indiquées. "
            "Regroupez leurs réglages ou créez des tâches distinctes.",
        }
    if found:
        begin, end, recurrence, upcoming = found[0]
        begin, end = tokens[begin].start, tokens[end - 1].end
    else:
        recurrence = None
        candidates = []
        for index, token in enumerate(tokens):
            if literal(token.start, token.end):
                continue
            try:
                result = read_date(tokens, index, today)
            except (ValueError, OverflowError):
                continue
            if result and not literal(token.start, tokens[result[1] - 1].end):
                candidates.append((token.start, tokens[result[1] - 1].end, result[0]))
        if not candidates:
            return empty
        begin, end, due = max(
            candidates, key=lambda candidate: (candidate[1] - candidate[0], candidate[0])
        )
        upcoming = [due]
    title = re.sub(r"\s+", " ", text[:begin] + " " + text[end:]).strip(" ,;–-")
    return {
        "title": title,
        "due_date": upcoming[0],
        "recurrence": recurrence,
        "matched_text": text[begin:end],
        "start": begin,
        "end": end,
        "label": describe(recurrence) if recurrence else upcoming[0].strftime("%d/%m/%Y"),
        "dates": upcoming,
        "status": "recognized",
        "diagnostic": None,
    }
