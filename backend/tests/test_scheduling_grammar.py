"""Behavioral families: wording, clause composition, meaning and safe live prefixes."""

from datetime import date, timedelta
from itertools import permutations

import pytest

from life_app.features.tasks.recurrence import dates
from life_app.features.tasks.scheduling import parse_schedule

TODAY = date(2026, 11, 14)


def parsed(expression):
    result = parse_schedule("Faire le point " + expression, TODAY, "Europe/Paris")
    assert result["status"] == "recognized", result
    assert result["title"] == "Faire le point", result
    assert result["matched_text"] == expression
    return result


@pytest.mark.parametrize(
    ("expression", "interval"),
    [
        ("un", 1),
        ("une", 1),
        ("deux", 2),
        ("trois", 3),
        ("dix-sept", 17),
        ("vingt et un", 21),
        ("vingt-et-une", 21),
        ("trente-deux", 32),
        ("soixante et onze", 71),
        ("soixante-douze", 72),
        ("quatre-vingts", 80),
        ("quatre-vingt-un", 81),
        ("quatre-vingt-dix-neuf", 99),
        ("septante", 70),
        ("huitante-deux", 82),
        ("nonante-neuf", 99),
        ("cent", 100),
        ("deux cents", 200),
        ("deux cent vingt et un", 221),
        ("neuf cent quatre-vingt-dix-neuf", 999),
        ("mille", 1000),
        ("21", 21),
    ],
)
@pytest.mark.parametrize(
    ("unit", "frequency"),
    [("jours", "DAILY"), ("semaines", "WEEKLY"), ("mois", "MONTHLY"), ("ans", "YEARLY")],
)
def test_written_numbers_use_the_same_interval_in_every_unit(expression, interval, unit, frequency):
    result = parsed(f"tous les {expression} {unit}")
    assert result["recurrence"].rrule == f"FREQ={frequency};INTERVAL={interval}"
    assert result["due_date"] == TODAY


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        ("tous les mois", "FREQ=MONTHLY;INTERVAL=1"),
        ("chaque fin de mois", "FREQ=MONTHLY;BYMONTHDAY=-1"),
        ("tous les débuts d’année", "FREQ=YEARLY;BYYEARDAY=1"),
        ("en fin de chaque mois", "FREQ=MONTHLY;BYMONTHDAY=-1"),
        ("chaque début de semaine", "FREQ=WEEKLY;BYDAY=MO"),
        ("tous les 21 du mois", "FREQ=MONTHLY;BYMONTHDAY=21"),
        ("tous les vingt et un du mois", "FREQ=MONTHLY;BYMONTHDAY=21"),
        ("un jour sur deux", "FREQ=DAILY;INTERVAL=2"),
        ("un mercredi sur trois", "FREQ=WEEKLY;BYDAY=WE;INTERVAL=3"),
        ("une fois toutes les trois semaines le mercredi", "FREQ=WEEKLY;BYDAY=WE;INTERVAL=3"),
        ("deux fois par semaine le lundi et le jeudi", "FREQ=WEEKLY;BYDAY=MO,TH;INTERVAL=1"),
        ("deux fois par mois les 1er et 21", "FREQ=MONTHLY;BYMONTHDAY=1,21;INTERVAL=1"),
        (
            "deux fois par an les 1er janvier et 1er juillet",
            "FREQ=YEARLY;BYMONTH=1,7;BYMONTHDAY=1;INTERVAL=1",
        ),
        ("une semaine sur trois", "FREQ=WEEKLY;INTERVAL=3"),
        ("un mois sur deux", "FREQ=MONTHLY;INTERVAL=2"),
        ("tous les trimestres", "FREQ=MONTHLY;INTERVAL=3"),
        ("tous les deux semestres", "FREQ=MONTHLY;INTERVAL=12"),
        ("toutes les quinzaines", "FREQ=WEEKLY;INTERVAL=2"),
        ("mensuellement", "FREQ=MONTHLY;INTERVAL=1"),
        ("trimestrielle", "FREQ=MONTHLY;INTERVAL=3"),
        ("tous les lundis, mercredis et vendredis", "FREQ=WEEKLY;BYDAY=MO,WE,FR"),
        ("du vendredi au lundi chaque semaine", "FREQ=WEEKLY;BYDAY=MO,FR,SA,SU;INTERVAL=1"),
        ("les 1er et 21 de chaque mois", "FREQ=MONTHLY;BYMONTHDAY=1,21"),
        ("les vingt et un et vingt-deux du mois", "FREQ=MONTHLY;BYMONTHDAY=21,22"),
        ("tous les mois du 1 au 5", "FREQ=MONTHLY;BYMONTHDAY=1,2,3,4,5;INTERVAL=1"),
        (
            "le premier et le troisième mardi de chaque trimestre",
            "FREQ=MONTHLY;BYDAY=1TU,3TU;INTERVAL=3",
        ),
        ("le premier lundi et le dernier vendredi de chaque mois", "FREQ=MONTHLY;BYDAY=1MO,-1FR"),
        ("les deux derniers jours du mois", "FREQ=MONTHLY;BYMONTHDAY=-2,-1"),
        ("le dernier jour ouvré de chaque mois", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1"),
        (
            "les deux derniers jours ouvrés du mois",
            "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2,-1",
        ),
        ("chaque avant-dernier dimanche du mois", "FREQ=MONTHLY;BYDAY=-2SU"),
        ("les jours ouvrables chaque semaine", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA;INTERVAL=1"),
        ("les week-ends toutes les deux semaines", "FREQ=WEEKLY;BYDAY=SA,SU;INTERVAL=2"),
        (
            "les premiers lundis de janvier et juillet chaque année",
            "FREQ=YEARLY;BYDAY=1MO;BYMONTH=1,7;INTERVAL=1",
        ),
        ("tous les premiers janvier", "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1"),
        ("tous les 1 et 15 janvier et juillet", "FREQ=YEARLY;BYMONTH=1,7;BYMONTHDAY=1,15"),
        ("chaque centième jour de l’année", "FREQ=YEARLY;BYYEARDAY=100"),
        ("le dernier jour de chaque année", "FREQ=YEARLY;BYYEARDAY=-1"),
        ("tous les jours sauf le week-end", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;INTERVAL=1"),
        ("tous les lundis et jeudis sauf le jeudi", "FREQ=WEEKLY;BYDAY=MO"),
        ("tous les mois pairs le quinze", "FREQ=YEARLY;BYMONTH=2,4,6,8,10,12;BYMONTHDAY=15"),
    ],
)
def test_calendar_vocabulary_composes_without_expression_specific_rules(expression, expected):
    assert parsed(expression)["recurrence"].rrule == expected


@pytest.mark.parametrize("weekday", range(7))
@pytest.mark.parametrize("interval", [1, 2, 3, 7, 12])
def test_named_weekday_and_interval_in_both_orders_start_at_next_eligible_day(weekday, interval):
    names = ["lundis", "mardis", "mercredis", "jeudis", "vendredis", "samedis", "dimanches"]
    day = "tous les " + names[weekday]
    rhythm = f"toutes les {interval} semaines"
    first = TODAY + timedelta(days=(weekday - TODAY.weekday()) % 7)
    expected = [first + timedelta(weeks=interval * i) for i in range(6)]
    for expression in [day + " " + rhythm, rhythm + " " + day]:
        assert parsed(expression)["dates"] == expected


@pytest.mark.parametrize(
    "clauses",
    list(
        permutations(
            [
                "tous les mercredis",
                "toutes les trois semaines",
                "à partir du 1 janvier 2027",
                "pour quatre fois",
                "sauf le 27 janvier 2027",
            ]
        )
    ),
)
def test_all_orders_of_five_independent_clauses_have_identical_semantics(clauses):
    result = parsed(" ".join(clauses))
    assert result["dates"] == [
        date(2027, 1, 6),
        date(2027, 2, 17),
        date(2027, 3, 10),
        date(2027, 3, 31),
    ]
    assert result["recurrence"].start_date == date(2027, 1, 6)
    assert result["recurrence"].excluded_dates == [date(2027, 1, 27)]


def test_duration_end_and_exclusions_are_resolved_from_start_independently_of_order():
    for expression in [
        "tous les jours pendant trois mois à partir du 14 novembre 2026",
        "pendant trois mois à partir du 14 novembre 2026 tous les jours",
    ]:
        assert parsed(expression)["recurrence"].end_date == date(2027, 2, 13)
    result = parsed(
        "tous les jours du 24 décembre 2026 au 2 janvier 2027 sauf du 25/12/2026 au 31/12/2026"
    )
    assert result["dates"] == [date(2026, 12, 24), date(2027, 1, 1), date(2027, 1, 2)]
    result = parsed("tous les jours jusqu’au 29 février à partir du 1 janvier 2028")
    assert result["recurrence"].end_date == date(2028, 2, 29)


def test_exclusion_does_not_reanchor_the_interval_and_iso_week_parity_is_explicit():
    result = parsed("tous les mercredis toutes les trois semaines sauf le 18 novembre")
    assert result["dates"][:2] == [date(2026, 12, 9), date(2026, 12, 30)]
    result = parsed("les semaines impaires le mercredi")
    assert result["dates"][:3] == [date(2026, 11, 18), date(2026, 12, 2), date(2026, 12, 16)]
    assert all(value.isocalendar().week % 2 == 1 for value in result["dates"])


@pytest.mark.parametrize(
    ("expression", "exception", "weekdays", "months"),
    [
        ("tous les trois jours", "sauf le week-end", {5, 6}, set()),
        ("toutes les trois semaines le samedi et le lundi", "sauf le samedi", {5}, set()),
        ("tous les trois mois les 1er et 21", "sauf le week-end", {5, 6}, set()),
        ("tous les mois", "sauf le dimanche", {6}, set()),
        ("tous les mois le 21", "sauf le week-end", {5, 6}, set()),
        ("tous les ans", "sauf en août", set(), {8}),
        ("tous les ans", "sauf le week-end", {5, 6}, set()),
        ("tous les ans le 21", "sauf en août", set(), {8}),
        ("tous les ans le 21", "sauf le week-end", {5, 6}, set()),
        ("tous les ans en décembre", "sauf le dimanche", {6}, set()),
        ("tous les ans le centième jour", "sauf le week-end", {5, 6}, set()),
        (
            "tous les deux ans les premiers lundis de janvier et juillet",
            "sauf en janvier",
            set(),
            {1},
        ),
    ],
)
def test_calendar_exclusions_only_remove_dates_and_preserve_the_original_interval(
    expression, exception, weekdays, months
):
    original = parsed(expression)["recurrence"]
    candidates = dates(original, TODAY, inclusive=True, limit=60)
    expected = [d for d in candidates if d.weekday() not in weekdays and d.month not in months][:6]
    assert len(expected) == 6
    result = parsed(expression + " " + exception)
    assert result["recurrence"].start_date == original.start_date
    assert result["dates"] == expected


def test_yearly_and_monthly_ordinals_follow_the_period_with_either_clause_order():
    for expression in ["chaque dernier jour annuellement", "annuellement le dernier jour"]:
        result = parsed(expression)
        assert result["dates"][:2] == [date(2026, 12, 31), date(2027, 12, 31)]
    result = parsed("tous les ans le centième jour")
    assert result["dates"][:2] == [date(2027, 4, 10), date(2028, 4, 9)]
    result = parsed("chaque dernier jour en juin annuellement")
    assert result["dates"][:2] == [date(2027, 6, 30), date(2028, 6, 30)]
    for expression in ["tous les 21 mensuellement", "mensuellement le 21"]:
        assert parsed(expression)["dates"][:2] == [date(2026, 11, 21), date(2026, 12, 21)]


def test_weekday_filters_precede_positions_but_explicit_dates_are_removed_afterwards():
    result = parsed("chaque dernier jour ouvré du mois sauf les vendredis")
    assert result["dates"][:3] == [date(2026, 11, 30), date(2026, 12, 31), date(2027, 1, 28)]
    result = parsed("chaque dernier jour ouvré du mois sauf le 30 novembre 2026")
    assert result["dates"][:2] == [date(2026, 12, 31), date(2027, 1, 29)]


@pytest.mark.parametrize(
    "expression",
    [
        "tous les mercredis toutes les",
        "tous les mercredis toutes les trois",
        "tous les mercredis toutes les trois sem",
        "tous les jours à partir de",
        "tous les jours jusqu’au",
        "tous les jours sauf",
        "tous les jours pendant trois",
        "toutes les deux semaines le",
        "tous les jours en",
        "tous les jours après résol",
        "à partir de tous les mercredis",
        "jusqu’au tous les lundis",
    ],
)
def test_live_incomplete_compositions_never_apply_a_valid_prefix(expression):
    text = "Lire " + expression
    result = parse_schedule(text, TODAY, "Europe/Paris")
    assert result["status"] == "incomplete", result
    assert result["diagnostic"]
    assert result["title"] == text
    assert result["recurrence"] is None and result["matched_text"] is None and result["dates"] == []


@pytest.mark.parametrize(
    "expression",
    [
        "tous les jours toutes les deux semaines",
        "toutes les zéro semaines",
        "tous les mille un jours",
        "tous les jours pour zéro fois",
        "tous les jours jusqu’au 31 février 2027",
        "tous les jours pour trois fois jusqu’au 31 décembre",
        "chaque trente-deux du mois",
        "tous les lundis après résolution",
        "tous les lundis sauf lundi",
        "toutes les deux heures",
        "les premiers lundis et les deux derniers jours ouvrés du mois",
        "tous les 1er janvier et 15 juillet",
        "tous les 21 du mois et 5 décembre",
        "tous les deux jours ouvrés",
        "deux fois par semaine",
        "trois fois par semaine lundi et jeudi",
        "deux jours sur trois",
        "bimensuel",
        "tous les jours sauf les jours fériés",
        "tous les lundis courir tous les jeudis",
        "tous les jours sauf du 01/01/2027 au 31/12/2028",
        "tous les ans le premier lundi sauf en août",
        "les lundis et le dernier vendredi de chaque mois",
    ],
)
def test_conflicts_and_nonrepresentable_meanings_are_explained_without_a_partial_schedule(
    expression,
):
    result = parse_schedule("Lire " + expression, TODAY, "Europe/Paris")
    assert result["status"] in {"invalid", "incomplete"}, result
    assert result["diagnostic"]
    assert result["title"] == "Lire " + expression
    assert result["recurrence"] is None and result["due_date"] is None


@pytest.mark.parametrize(
    "text",
    [
        "Acheter les trois pommes",
        "Préparer les vingt et un dossiers",
        "Ranger les premiers livres",
        "Appeler tous les clients",
        "Relire chaque chapitre",
        "Un monde de lendemains",
        "Relire « tous les mercredis toutes les trois semaines »",
        'Lire "tous les jours"',
        "Comparer les surfaces en m² et m³",
    ],
)
def test_ordinary_numbers_and_quoted_recurrences_stay_literal(text):
    result = parse_schedule(text, TODAY, "Europe/Paris")
    assert result["status"] == "none", result
    assert result["title"] == text and result["diagnostic"] is None


def test_unicode_and_surrounding_title_survive_composition_and_written_relative_date():
    text = "🧘 Re\u0301viser TOUS\u00a0LES MERCREDIS toutes les trois semaines avec Léa"
    result = parse_schedule(text, TODAY, "Pacific/Auckland")
    assert result["title"] == "🧘 Re\u0301viser avec Léa"
    assert text[result["start"] : result["end"]] == result["matched_text"]
    assert result["recurrence"].timezone == "Pacific/Auckland"
    assert parsed("dans vingt et un jours")["due_date"] == date(2026, 12, 5)
    assert parsed("l’année prochaine")["due_date"] == date(2027, 1, 1)


@pytest.mark.parametrize(
    "title", ["Facture 2026", "Les 21 dossiers", "Préparer le dossier 123", "Budget vingt et un"]
)
def test_title_numbers_before_a_recurrence_are_not_calendar_selectors(title):
    result = parse_schedule(title + " tous les deux jours", TODAY, "Europe/Paris")
    assert result["status"] == "recognized", result
    assert result["title"] == title
    assert result["recurrence"].rrule == "FREQ=DAILY;INTERVAL=2"


def test_a_business_period_before_a_named_recurrence_stays_in_the_title():
    result = parse_schedule("Préparer le premier trimestre chaque lundi", TODAY, "Europe/Paris")
    assert result["title"] == "Préparer le premier trimestre"
    assert result["recurrence"].rrule == "FREQ=WEEKLY;BYDAY=MO"


def test_maximum_input_size_and_deterministic_malformed_vocabulary_do_not_crash():
    import random

    randomizer = random.Random(13)
    vocabulary = (
        "tous les deux jours et premier lundi mois sauf du au pour fois "
        "janvier 2027 31 / trois mille"
    ).split()
    inputs = ["vingt " * 150, "1 " * 450, '"' * 1000]
    inputs.extend(" ".join(randomizer.choices(vocabulary, k=25)) for _ in range(150))
    for text in inputs:
        result = parse_schedule(text, TODAY, "Europe/Paris")
        assert result["status"] in {"none", "recognized", "incomplete", "invalid"}
        if result["status"] != "recognized":
            assert result["title"] == text and result["recurrence"] is None
