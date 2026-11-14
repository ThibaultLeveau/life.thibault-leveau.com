from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from life_app.features.tasks.recurrence import Recurrence, dates, next_due
from life_app.features.tasks.scheduling import parse_schedule


@pytest.mark.parametrize(
    ("text", "title", "due", "rule"),
    [
        ("Acheter du pain demain", "Acheter du pain", "2026-11-15", None),
        ("Après-demain appeler Léa", "appeler Léa", "2026-11-16", None),
        ("Lire aujourd’hui", "Lire", "2026-11-14", None),
        ("Dossier dans 2 semaines", "Dossier", "2026-11-28", None),
        ("Voyage 25 décembre", "Voyage", "2026-12-25", None),
        ("Facture 15/01", "Facture", "2027-01-15", None),
        ("Sport tous les lundis", "Sport", "2026-11-16", "FREQ=WEEKLY;BYDAY=MO"),
        ("Sport tous les lundis et jeudis", "Sport", "2026-11-16", "FREQ=WEEKLY;BYDAY=MO,TH"),
        ("Budget tous les 15 du mois", "Budget", "2026-11-15", "FREQ=MONTHLY;BYMONTHDAY=15"),
        ("Bilan chaque dernier vendredi du mois", "Bilan", "2026-11-27", "FREQ=MONTHLY;BYDAY=-1FR"),
        (
            "Compta chaque dernier jour du mois",
            "Compta",
            "2026-11-30",
            "FREQ=MONTHLY;BYMONTHDAY=-1",
        ),
        ("Pause tous les jours ouvrés", "Pause", "2026-11-16", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"),
        (
            "Anniversaire tous les 29 février",
            "Anniversaire",
            "2028-02-29",
            "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29",
        ),
    ],
)
def test_french_scheduling(text, title, due, rule):
    result = parse_schedule(text, date(2026, 11, 14), "Europe/Paris")
    assert result["title"] == title
    assert result["due_date"].isoformat() == due
    assert (result["recurrence"].rrule if result["recurrence"] else None) == rule
    assert text[result["start"] : result["end"]] == result["matched_text"]


@pytest.mark.parametrize(
    "text",
    [
        'Lire "demain"',
        "Lire « demain »",
        "un lendemain heureux",
        "Dossier 31/02/2027",
        "Tous les 0 jours",
        "Toutes les 2 heures",
        "Sport tous les blablas lundi",
    ],
)
def test_unknown_and_literal_text_remain_intact(text):
    result = parse_schedule(text, date(2026, 11, 14), "Europe/Paris")
    assert result["matched_text"] is None
    assert result["title"] == text


def test_start_end_count_and_completion_modifiers():
    result = parse_schedule(
        "Arroser tous les 3 jours après résolution à partir de demain pour 5 fois",
        date(2026, 11, 14),
        "Europe/Paris",
    )
    assert result["title"] == "Arroser"
    assert result["recurrence"].mode == "completion"
    assert result["recurrence"].max_occurrences == 5
    assert len(result["dates"]) == 5
    assert result["dates"][0] == date(2026, 11, 15)


def test_calendar_edges_exclusions_and_last_working_day():
    monthly = Recurrence(rrule="FREQ=MONTHLY;BYMONTHDAY=31", start_date="2026-01-31")
    assert dates(monthly, monthly.start_date, inclusive=True, limit=3) == [
        date(2026, 1, 31),
        date(2026, 3, 31),
        date(2026, 5, 31),
    ]
    last = Recurrence(
        rrule="FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
        start_date="2026-01-01",
        excluded_dates=["2026-01-30"],
        end_date="2026-03-31",
    )
    assert dates(last, last.start_date, inclusive=True) == [date(2026, 2, 27), date(2026, 3, 31)]


def test_completion_modes_lateness_timezone_and_limits():
    rule = Recurrence(
        rrule="FREQ=DAILY;INTERVAL=3", start_date="2026-11-01", timezone="Europe/Paris"
    )
    now = datetime(2026, 11, 14, 23, 30, tzinfo=UTC)  # November 15 locally
    assert next_due(rule, date(2026, 11, 1), now, 1) == date(2026, 11, 16)
    rule.mode = "completion"
    assert next_due(rule, date(2026, 11, 1), now, 1) == date(2026, 11, 18)
    rule.max_occurrences = 1
    assert next_due(rule, date(2026, 11, 1), now, 1) is None
    end = Recurrence(rrule="FREQ=DAILY", start_date="9999-12-31")
    assert dates(end, end.start_date, inclusive=True) == [date(9999, 12, 31)]
    assert next_due(end, end.start_date, now, 0) is None


@pytest.mark.parametrize(
    "rule",
    [
        "FREQ=SECONDLY",
        "FREQ=DAILY;COUNT=2",
        "FREQ=DAILY;INTERVAL=0",
        "FREQ=MONTHLY;BYDAY=0MO",
        "FREQ=WEEKLY;BYDAY=2MO",
        "FREQ=DAILY;BYMONTH=13",
        "FREQ=DAILY;BYSETPOS=-1",
        "FREQ=DAILY\nDTSTART:20260101",
        "FREQ=DAILY;FREQ=WEEKLY",
    ],
)
def test_reject_invalid_rules(rule):
    with pytest.raises(ValidationError):
        Recurrence(rrule=rule, start_date="2026-01-01")


def test_impossible_rule_and_empty_end_have_no_dates():
    rule = Recurrence(rrule="FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", start_date="2026-01-01")
    assert dates(rule, rule.start_date) == []


def test_impossible_daily_rule_and_old_anchor_have_bounded_search():
    rule = Recurrence(rrule="FREQ=DAILY;BYMONTH=2;BYMONTHDAY=31", start_date="0001-01-01")
    assert dates(rule, date(2026, 11, 14)) == []
    rule = Recurrence(rrule="FREQ=DAILY;INTERVAL=7;BYDAY=TU", start_date="2026-11-16")
    assert dates(rule, date(2026, 11, 16)) == []


@pytest.mark.parametrize(
    "expression",
    [
        "tous les jours jusqu’au 31/02/2027",
        "tous les jours jusqu’au",
        "tous les jours à partir de",
    ],
)
def test_invalid_or_unfinished_modifiers_do_not_silently_create_endless_series(expression):
    result = parse_schedule("Lire " + expression, date(2026, 11, 14), "Europe/Paris")
    assert result["matched_text"] is None


def test_monthly_and_weekly_french_variants():
    result = parse_schedule("Budget tous les 2 mois le 1 et 15", date(2026, 11, 14), "Europe/Paris")
    assert result["title"] == "Budget"
    assert result["recurrence"].rrule == "FREQ=MONTHLY;BYMONTHDAY=1,15;INTERVAL=2"
    result = parse_schedule(
        "Sport toutes les 2 semaines le lundi", date(2026, 11, 14), "Europe/Paris"
    )
    assert result["title"] == "Sport"
    assert result["recurrence"].rrule == "FREQ=WEEKLY;BYDAY=MO;INTERVAL=2"


def test_combining_accents_and_emoji_preserve_title_and_original_offsets():
    text = "🧘 Re\u0301viser apre\u0300s-demain"
    result = parse_schedule(text, date(2026, 11, 14), "Europe/Paris")
    assert result["title"] == "🧘 Re\u0301viser"
    assert result["matched_text"] == "apre\u0300s-demain"
    assert text[result["start"] : result["end"]] == result["matched_text"]


@pytest.mark.parametrize(
    "rule",
    [
        "FREQ=DAILY;INTERVAL=3",
        "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR",
        "FREQ=WEEKLY;INTERVAL=5;BYDAY=SU,WE;WKST=SU",
    ],
)
def test_fast_forward_preserves_calendar_phase(rule):
    from datetime import time
    from itertools import islice

    from dateutil.rrule import rrulestr

    start = date(1960, 1, 6)
    rule_data = Recurrence(rrule=rule, start_date=start)
    for after in [date(2026, 11, 14), date(2026, 11, 16), date(2026, 11, 18)]:
        reference = rrulestr(
            rule + (";WKST=MO" if "WKST=" not in rule else ""),
            dtstart=datetime.combine(start, time.min),
        )
        expected = [
            value.date()
            for value in islice(reference.xafter(datetime.combine(after, time.min), inc=True), 6)
        ]
        assert dates(rule_data, after, inclusive=True) == expected
