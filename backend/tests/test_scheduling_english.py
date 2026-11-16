"""English vocabulary shares the French calendar semantics and untouched title spans."""

from datetime import date
from itertools import permutations

import pytest
from starlette.requests import Request

from life_app.apps.tasks.scheduling import parse_schedule
from life_app.core.i18n import request_context

TODAY = date(2026, 11, 14)


@pytest.fixture(autouse=True)
def english_request():
    token = request_context.set(Request({"type": "http", "state": {"locale": "en"}}))
    yield
    request_context.reset(token)


@pytest.mark.parametrize(
    ("expression", "due", "rule"),
    [
        ("tomorrow", "2026-11-15", None),
        ("today", "2026-11-14", None),
        ("yesterday", "2026-11-13", None),
        ("day after tomorrow", "2026-11-16", None),
        ("next Monday", "2026-11-16", None),
        ("next week", "2026-11-16", None),
        ("in twenty-one days", "2026-12-05", None),
        ("on January 21, 2027", "2027-01-21", None),
        ("on 21 January 2027", "2027-01-21", None),
        ("on 21/01/2027", "2027-01-21", None),
        ("2027-01-21", "2027-01-21", None),
        ("every Monday", "2026-11-16", "FREQ=WEEKLY;BYDAY=MO"),
        ("every other day", "2026-11-14", "FREQ=DAILY;INTERVAL=2"),
        ("every other Monday", "2026-11-16", "FREQ=WEEKLY;BYDAY=MO;INTERVAL=2"),
        (
            "every three weeks on Monday and Thursday",
            "2026-11-16",
            "FREQ=WEEKLY;BYDAY=MO,TH;INTERVAL=3",
        ),
        ("every first Monday of the month", "2026-12-07", "FREQ=MONTHLY;BYDAY=1MO"),
        (
            "every last business day of the month",
            "2026-11-30",
            "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
        ),
        ("every 1st and 21st of the month", "2026-11-21", "FREQ=MONTHLY;BYMONTHDAY=1,21"),
        ("every day after completion", "2026-11-14", "FREQ=DAILY;INTERVAL=1"),
        ("every twenty-one days", "2026-11-14", "FREQ=DAILY;INTERVAL=21"),
        ("every one hundred and five days", "2026-11-14", "FREQ=DAILY;INTERVAL=105"),
    ],
)
def test_english_calendar_semantics_and_unicode_spans(expression, due, rule):
    title = "📖 Lire un livre — café"
    text = f"{title} {expression}"
    result = parse_schedule(text, TODAY, "Europe/Paris")
    assert result["status"] == "recognized", result
    assert result["title"] == title
    assert result["matched_text"] == expression
    assert text[result["start"] : result["end"]] == expression
    assert result["due_date"].isoformat() == due
    assert (result["recurrence"].rrule if result["recurrence"] else None) == rule
    if rule:
        assert result["label"].startswith("Every")


def test_english_bounds_and_exclusions_compose_in_each_order():
    for clauses in permutations(
        ["every other day", "starting tomorrow", "for five times", "except November 17, 2026"]
    ):
        text = "Run " + " ".join(clauses)
        result = parse_schedule(text, TODAY, "Europe/Paris")
        assert result["status"] == "recognized", (text, result)
        assert result["title"] == "Run"
        assert result["recurrence"].max_occurrences == 5
        assert result["recurrence"].excluded_dates == [date(2026, 11, 17)]
        assert result["dates"][:3] == [date(2026, 11, 15), date(2026, 11, 19), date(2026, 11, 21)]
        assert "5 occurrences" in result["label"] and "1 excluded date" in result["label"]


@pytest.mark.parametrize(
    "expression",
    [
        "every",
        "every two",
        "every day except",
        "every day until",
        "every first",
        "every Monday after completion",
        "every day every two days",
        "every hour",
        "every day except public holidays",
    ],
)
def test_incomplete_and_unsupported_english_never_applies_a_partial_rule(expression):
    text = "Run " + expression
    result = parse_schedule(text, TODAY, "Europe/Paris")
    assert result["status"] in {"incomplete", "invalid"}, result
    assert result["title"] == text
    assert result["recurrence"] is None and result["due_date"] is None
    assert result["diagnostic"]
    assert not any(
        word in result["diagnostic"] for word in ("Choisissez", "Complétez", "jours", "récurrence")
    )


@pytest.mark.parametrize(
    "title",
    [
        'Read "tomorrow"',
        "Discuss “everyday life”",
        "Read “tomorrow”",
        "Discuss “every Monday”",
        "Look after plants",
        "Review every painting",
        "Chapter twenty-one",
        "May I ask a question",
    ],
)
def test_english_literal_titles_are_preserved(title):
    result = parse_schedule(title, TODAY, "Europe/Paris")
    assert result["status"] == "none", result
    assert result["title"] == title


@pytest.mark.parametrize(
    "expression",
    [
        "every two days",
        "every Wednesday every three weeks",
        "every other week on Monday through Friday",
        "every 1st and 21st of the month",
        "every last business day of the month",
        "every day for five times except tomorrow",
    ],
)
def test_every_displayed_help_example_is_recognized(expression):
    result = parse_schedule("Read " + expression, TODAY, "Europe/Paris")
    assert result["status"] == "recognized", result
    assert result["title"] == "Read" and result["dates"]


def test_english_relative_date_at_calendar_boundary_preserves_the_title():
    result = parse_schedule("Read yesterday", date.min, "Europe/Paris")
    assert result["status"] == "none"
    assert result["title"] == "Read yesterday"
