"""Composable calendar clauses, compiled into the existing Recurrence contract.

The grammar reads vocabulary and lists once. Cadence, selectors and modifiers
are independent constraints; no expression-specific regex decides a schedule.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from life_app.apps.tasks.messages import tr
from life_app.apps.tasks.recurrence import DAY_NAMES, WEEKDAYS, Recurrence, dates
from life_app.apps.tasks.scheduling_language import (
    ALIASES,
    MONTHS,
    Token,
    number,
    ordinal,
    read_date,
    singular,
    unit,
    word,
)


class ScheduleError(ValueError):
    def __init__(self, message: str, status="invalid"):
        super().__init__(message)
        self.status = status


@dataclass
class CalendarSpec:
    cadence: tuple[str, int] | None = None
    selectors: dict[str, set] = field(default_factory=dict)
    annual_dates: set[tuple[int, int]] = field(default_factory=set)
    scopes: set[str] = field(default_factory=set)
    bounds: dict[str, list[Token]] = field(default_factory=dict)
    count: int | None = None
    rate: int | None = None
    duration: tuple[str, int] | None = None
    completion: bool = False
    excluded_days: set[str] = field(default_factory=set)
    excluded_months: set[int] = field(default_factory=set)
    excluded_dates: list[tuple[list[Token], list[Token] | None]] = field(default_factory=list)

    def frequency(self, value):
        if self.cadence is not None and self.cadence != value:
            raise ScheduleError(
                tr("two_different_intervals_were_specified_keep_a_single_repeat_interval")
            )
        self.cadence = value

    def select(self, key, values):
        self.selectors.setdefault(key, set()).update(values)

    def compile(self, today: date, timezone: str) -> Recurrence:
        start = read_date(self.bounds["start"], 0, today)[0] if "start" in self.bounds else today
        end = read_date(self.bounds["end"], 0, start)[0] if "end" in self.bounds else None
        if self.duration:
            key = {"DAILY": "days", "WEEKLY": "weeks", "MONTHLY": "months", "YEARLY": "years"}[
                self.duration[0]
            ]
            duration_end = start + relativedelta(**{key: self.duration[1]}) - timedelta(days=1)
            if end is not None and end != duration_end:
                raise ScheduleError(
                    tr("the_duration_and_end_date_give_different_endings_choose_one_of_them")
                )
            end = duration_end
        if end is not None and self.count is not None:
            raise ScheduleError(tr("choose_an_end_date_a_duration_or_a_number_of_occurrences"))
        selected = {key: set(value) for key, value in self.selectors.items()}
        if self.annual_dates:
            month_days = {day for _, day in self.annual_dates}
            months = {month for month, _ in self.annual_dates}
            if self.annual_dates != {(month, day) for month in months for day in month_days}:
                raise ScheduleError(
                    tr("these_annual_dates_have_different_days_in_each_month_use_separate_tasks")
                )
            if selected.get("BYMONTHDAY", month_days) != month_days:
                raise ScheduleError(
                    tr(
                        "this_expression_mixes_different_annual_and_monthly_dates_use_separate_schedules"
                    )
                )
            selected.setdefault("BYMONTHDAY", set()).update(month_days)
            selected.setdefault("BYMONTH", set()).update(months)
        inferred = (
            "YEARLY"
            if "YEARLY" in self.scopes or {"BYMONTH", "BYWEEKNO"} & selected.keys()
            else "MONTHLY"
            if "MONTHLY" in self.scopes
            or {"BYMONTHDAY", "ORDINALDAY", "BYSETPOS"} & selected.keys()
            or any(len(d) > 2 for d in selected.get("BYDAY", []))
            else "WEEKLY"
        )
        frequency, interval = self.cadence or (inferred, 1)
        weekdays = selected.get("BYDAY", set())
        if any(len(day) > 2 for day in weekdays) and any(len(day) == 2 for day in weekdays):
            raise ScheduleError(
                tr(
                    "days_with_and_without_positions_form_different_schedules_specify_a_position_for"
                )
            )
        if "BYWEEKNO" in selected:
            if self.cadence and self.cadence not in {("WEEKLY", 1), ("YEARLY", 1)}:
                raise ScheduleError(
                    tr("numbered_weeks_repeat_every_year_remove_the_other_interval")
                )
            frequency = "YEARLY"
            selected.setdefault("BYDAY", {WEEKDAYS[start.weekday()]})
        if "ORDINALDAY" in selected:
            key = (
                "BYYEARDAY"
                if frequency == "YEARLY"
                and "MONTHLY" not in self.scopes
                and "BYMONTH" not in selected
                else "BYMONTHDAY"
            )
            selected.setdefault(key, set()).update(selected.pop("ORDINALDAY"))
        if self.rate is not None:
            nominal = 1 if not selected else None
            if "BYSETPOS" in selected:
                nominal = len(selected["BYSETPOS"])
            elif "BYMONTHDAY" in selected and "BYDAY" not in selected:
                nominal = len(selected["BYMONTHDAY"])
            elif "BYDAY" in selected and (
                frequency == "WEEKLY" or all(len(day) > 2 for day in selected["BYDAY"])
            ):
                nominal = len(selected["BYDAY"])
            if nominal and frequency == "YEARLY":
                nominal *= len(selected.get("BYMONTH", {start.month}))
            if nominal != self.rate:
                raise ScheduleError(
                    tr("specify_the_days_for_the_requested_frequency_for_example_twice_a_week")
                )
        if frequency == "YEARLY" and "BYMONTHDAY" in selected and "BYMONTH" not in selected:
            selected["BYMONTH"] = {start.month}
        if self.completion and (selected or self.excluded_days or self.excluded_months):
            raise ScheduleError(
                tr("after_completion_uses_an_interval_only_remove_fixed_days_or_choose_a")
            )

        def make_rule(selection, step, anchor):
            parts = {"FREQ": frequency}
            if step != 1 or self.cadence:
                parts["INTERVAL"] = str(step)
            for key, values in selection.items():
                ordered = (
                    sorted(values, key=lambda value: (WEEKDAYS.index(value[-2:]), value[:-2]))
                    if key == "BYDAY"
                    else sorted(values)
                )
                parts[key] = ",".join(map(str, ordered))
            return Recurrence(
                rrule=";".join(f"{key}={value}" for key, value in parts.items()),
                start_date=anchor,
                timezone=timezone,
                mode="completion" if self.completion else "scheduled",
                end_date=end,
                max_occurrences=self.count,
            )

        # The first positive selection anchors the interval. Neither a weekday,
        # month nor explicit date exclusion may move that phase.
        anchor = start
        if selected and interval > 1:
            first = dates(make_rule(selected, 1, start), start, inclusive=True, limit=1)
            if not first:
                raise ScheduleError(
                    tr("these_settings_produce_no_dates_check_the_days_and_end_date")
                )
            anchor = first[0]

        # Adding BYDAY/BYMONTH disables some RFC defaults. Materialize those
        # defaults first, so an exclusion never expands a monthly/annual date.
        if (
            self.excluded_days
            and frequency in {"MONTHLY", "YEARLY"}
            and not ({"BYDAY", "BYMONTHDAY", "BYYEARDAY", "BYWEEKNO"} & selected.keys())
        ):
            selected["BYMONTHDAY"] = {anchor.day}
        if frequency == "YEARLY" and "BYMONTH" not in selected:
            if self.excluded_months and any(len(d) > 2 for d in selected.get("BYDAY", [])):
                raise ScheduleError(
                    tr("a_position_in_the_year_and_an_excluded_month_cannot_share_one")
                )
            if "BYMONTHDAY" in selected or (
                self.excluded_months and not {"BYDAY", "BYYEARDAY", "BYWEEKNO"} & selected.keys()
            ):
                selected["BYMONTH"] = {anchor.month}
        if self.excluded_days:
            if any(len(d) > 2 for d in selected.get("BYDAY", [])):
                selected["BYDAY"] = {
                    d for d in selected["BYDAY"] if d[-2:] not in self.excluded_days
                }
            else:
                default = {WEEKDAYS[anchor.weekday()]} if frequency == "WEEKLY" else set(WEEKDAYS)
                selected["BYDAY"] = selected.get("BYDAY", default) - self.excluded_days
        if self.excluded_months:
            selected["BYMONTH"] = selected.get("BYMONTH", set(range(1, 13))) - self.excluded_months
        if any(not values for values in selected.values()):
            raise ScheduleError(tr("the_exclusions_remove_all_selected_days_or_months"))
        rule = make_rule(selected, interval, anchor)
        exclusions = set()
        for first_tokens, last_tokens in self.excluded_dates:
            first = read_date(first_tokens, 0, start)[0]
            last = read_date(last_tokens, 0, first)[0] if last_tokens else first
            if last < first or (last - first).days > 365:
                raise ScheduleError(
                    tr("an_exclusion_range_must_be_chronological_and_cover_at_most_366_dates")
                )
            exclusions.update(first + timedelta(days=i) for i in range((last - first).days + 1))
            if len(exclusions) > 366:
                raise ScheduleError(tr("a_recurrence_can_have_at_most_366_excluded_dates"))
        rule.excluded_dates = sorted(exclusions)
        return Recurrence.model_validate(rule.model_dump())


class Grammar:
    def __init__(self, tokens: list[Token], start: int, today: date):
        self.tokens, self.pos, self.start, self.today = tokens, start, start, today
        self.spec = CalendarSpec()
        self.intent = False
        self.calendar_evidence = False
        self.barrier = False
        self.pending_day = False
        self.prefix_active = False
        self.directive = False

    def peek(self, offset=0):
        return word(self.tokens, self.pos + offset)

    def take(self, *values):
        if all(self.peek(i) == value for i, value in enumerate(values)):
            self.pos += len(values)
            return True
        return False

    def article(self):
        if self.peek() in {"le", "les", "la", "du", "des"}:
            self.pos += 1

    def attempt(self, reader):
        before = self.pos
        result = reader()
        if result is None:
            self.pos = before
        return result

    def list_of(self, reader, *, cycle=None):
        """Shared lists/ranges for weekdays, month days, ordinal positions and months."""
        first = reader(self.tokens, self.pos)
        if first is None:
            return None
        value, self.pos = first
        result = [value]
        while True:
            before = self.pos
            range_item = self.peek() in {"a", "au"}
            if self.peek() not in {",", "et", "&", "a", "au"}:
                break
            self.pos += 1
            self.article()
            item = reader(self.tokens, self.pos)
            if item is None:
                self.pos = before
                break
            other, self.pos = item
            if range_item:
                if not isinstance(value, int) or not isinstance(other, int):
                    raise ScheduleError(tr("this_calendar_range_is_not_recognized"))
                if other < value and cycle:
                    result.extend(range(value + 1, cycle + 1))
                    result.extend(range(1, other + 1))
                elif other < value or other - value > 366:
                    raise ScheduleError(tr("check_the_order_and_limits_of_the_day_range"))
                else:
                    result.extend(range(value + 1, other + 1))
            else:
                result.append(other)
            value = other
        return result

    @staticmethod
    def weekday(tokens, index):
        value = singular(word(tokens, index))
        return (DAY_NAMES.index(value) + 1, index + 1) if value in DAY_NAMES else None

    @staticmethod
    def month(tokens, index):
        value = word(tokens, index)
        return (MONTHS.index(value) + 1, index + 1) if value in MONTHS else None

    def day_group(self):
        if singular(self.peek()) == "jour":
            after = singular(self.peek(1))
            if after in {"ouvre", "ouvrable"}:
                self.pos += 2
                return list(range(1, 6 if after == "ouvre" else 7))
            if self.peek(1) == "de" and self.peek(2) == "semaine":
                self.pos += 3
                return list(range(1, 6))
            if self.peek(1) in {"de", "du"} and self.peek(2) == "week":
                self.pos += 2
        if self.peek() == "week" and singular(self.peek(1)) == "end":
            self.pos += 2
            return [6, 7]
        if singular(self.peek()) == "weekend":
            self.pos += 1
            return [6, 7]
        if self.take("en", "semaine"):
            return list(range(1, 6))
        return None

    def cadence(self):
        if self.peek() in ALIASES:
            value = ALIASES[self.peek()]
            self.pos += 1
            self.intent = True
            self.calendar_evidence = True
            if value[0] in {"MONTHLY", "YEARLY"}:
                self.pending_day = False
            return value
        amount = number(self.tokens, self.pos)
        end = amount[1] if amount else self.pos
        period = unit(self.tokens, end)
        weekday = self.weekday(self.tokens, end)
        if weekday and word(self.tokens, weekday[1]) == "sur":
            period = ("WEEKLY", 1)
            self.spec.select("BYDAY", {WEEKDAYS[weekday[0] - 1]})
        if not period:
            return None
        count = amount[0] if amount else 1
        self.pos = end + 1
        if self.take("sur"):
            self.intent = True
            if count != 1:
                raise ScheduleError(
                    tr("for_an_alternating_schedule_write_every_other_day_or_specify_the_days")
                )
            alternate = number(self.tokens, self.pos)
            if not alternate:
                raise ScheduleError(
                    tr("complete_the_alternating_interval_for_example_every_three_weeks"),
                    "incomplete",
                )
            count, self.pos = alternate
            self.intent = True
        if count <= 0 or count * period[1] > 1000:
            raise ScheduleError(tr("the_repeat_interval_must_be_between_1_and_1000"))
        if singular(self.peek()) in {"ouvre", "ouvrable"}:
            if period[0] != "DAILY" or count != 1:
                raise ScheduleError(
                    tr(
                        "a_business_day_interval_requires_a_different_calculation_choose_fixed_days_or"
                    )
                )
            length = 5 if singular(self.peek()) == "ouvre" else 6
            self.pos += 1
            self.spec.select("BYDAY", WEEKDAYS[:length])
        self.calendar_evidence = True
        if period[0] in {"MONTHLY", "YEARLY"}:
            self.pending_day = False
        return period[0], count * period[1]

    def month_dates(self, values):
        months = self.list_of(self.month, cycle=12)
        if months:
            self.spec.annual_dates.update((month, day) for month in months for day in values)
            self.calendar_evidence = True
            self.pending_day = False
        else:
            self.spec.select("BYMONTHDAY", values)
            self.pending_day = self.pending_day or self.prefix_active

    def selector(self):
        begin = self.pos
        self.article()
        if self.peek() == "en" and singular(self.peek(1)) in {"debut", "fin"}:
            self.pos += 1
        if singular(self.peek()) in {"debut", "fin"}:
            position = 1 if singular(self.peek()) == "debut" else -1
            self.pos += 1
            if self.peek() in {"de", "du"}:
                self.pos += 1
            elif self.take("d", "'"):
                pass
            if self.take("chaque"):
                self.intent = True
            if self.peek() in {"la", "le"}:
                self.pos += 1
            self.take("l", "'")
            period = unit(self.tokens, self.pos)
            if not period or period[0] not in {"MONTHLY", "YEARLY", "WEEKLY"}:
                raise ScheduleError(
                    tr("specify_start_end_of_month_of_week_or_of_year"), "incomplete"
                )
            self.pos += 1
            self.spec.scopes.add(period[0])
            if period[0] == "WEEKLY":
                self.spec.select("BYDAY", {"MO" if position == 1 else "SU"})
            else:
                self.spec.select("BYYEARDAY" if period[0] == "YEARLY" else "BYMONTHDAY", {position})
            self.calendar_evidence = True
            return True
        if self.peek() in {"de", "en"} and self.month(self.tokens, self.pos + 1):
            self.pos += 1
        elif self.take("d", "'"):
            pass
        if self.peek() == "semaine" or self.peek() == "semaines":
            self.pos += 1
            parity = singular(self.peek())
            if parity in {"pair", "impaire", "impair", "paire"}:
                self.pos += 1
                self.spec.select("BYWEEKNO", range(1 if parity.startswith("imp") else 2, 54, 2))
                self.calendar_evidence = True
                return True
            if self.peek() in {"numero", "numeros"}:
                self.pos += 1
                numbers = self.list_of(number)
                if not numbers:
                    raise ScheduleError(tr("enter_week_numbers_from_1_to_53"), "incomplete")
                self.spec.select("BYWEEKNO", numbers)
                self.calendar_evidence = True
                return True
            self.pos = begin
            return None
        if self.peek() == "mois" and singular(self.peek(1)) in {"pair", "impair"}:
            first = 1 if singular(self.peek(1)) == "impair" else 2
            self.pos += 2
            self.spec.select("BYMONTH", range(first, 13, 2))
            self.calendar_evidence = True
            return True
        group = self.attempt(self.day_group)
        if group:
            self.spec.select("BYDAY", (WEEKDAYS[d - 1] for d in group))
            self.calendar_evidence = True
            return True
        weekdays = self.list_of(self.weekday, cycle=7)
        if weekdays:
            self.spec.select("BYDAY", (WEEKDAYS[d - 1] for d in weekdays))
            self.calendar_evidence = True
            return True
        months = self.list_of(self.month, cycle=12)
        if months:
            self.spec.select("BYMONTH", months)
            self.calendar_evidence = True
            self.pending_day = False
            return True
        # 'les deux derniers jours' is a set of positions, not a two-day cadence.
        quantity = number(self.tokens, self.pos)
        positions = None
        if quantity and singular(word(self.tokens, quantity[1])) in {
            "dernier",
            "derniere",
            "premier",
            "premiere",
        }:
            if not 1 <= quantity[0] <= 31:
                raise ScheduleError(tr("choose_between_1_and_31_calendar_positions"))
            last = singular(word(self.tokens, quantity[1])).startswith("dern")
            positions = list(range(-quantity[0], 0)) if last else list(range(1, quantity[0] + 1))
            self.pos = quantity[1] + 1
        else:
            positions = self.list_of(ordinal)
        if positions:
            group = self.attempt(self.day_group)
            if group:
                if any(len(day) > 2 for day in self.spec.selectors.get("BYDAY", [])):
                    raise ScheduleError(
                        tr("separate_business_day_positions_from_named_weekday_positions")
                    )
                self.spec.select("BYDAY", (WEEKDAYS[d - 1] for d in group))
                self.spec.select("BYSETPOS", positions)
                self.calendar_evidence = True
                return True
            weekdays = self.list_of(self.weekday, cycle=7)
            if weekdays:
                if "BYSETPOS" in self.spec.selectors:
                    raise ScheduleError(
                        tr("separate_named_weekday_positions_from_business_day_positions")
                    )
                self.spec.select(
                    "BYDAY", (f"{p}{WEEKDAYS[d - 1]}" for p in positions for d in weekdays)
                )
                self.calendar_evidence = True
                return True
            if singular(self.peek()) == "jour":
                self.pos += 1
                self.spec.select("ORDINALDAY", positions)
                self.calendar_evidence = True
                return True
            if unit(self.tokens, self.pos):
                self.pos = begin
                return None
            # 'le premier janvier' and 'les 1er et 15' are month-day selectors.
            self.month_dates(positions)
            return True
        numeric = self.list_of(number)
        if numeric:
            weekday = self.weekday(self.tokens, self.pos)
            if unit(self.tokens, self.pos) or (weekday and word(self.tokens, weekday[1]) == "sur"):
                self.pos = begin
                return None
            self.month_dates(numeric)
            return True
        self.pos = begin
        return None

    def scope(self):
        start = self.pos
        if self.peek() in {"du", "de", "dans"}:
            self.pos += 1
            if self.peek() in {"chaque", "la", "le"}:
                self.intent = self.intent or self.peek() == "chaque"
                self.pos += 1
            elif self.take("l", "'"):
                pass
            period = unit(self.tokens, self.pos)
            if period:
                self.pos += 1
                self.spec.scopes.add(period[0])
                self.calendar_evidence = True
                if period[0] in {"MONTHLY", "YEARLY"}:
                    self.pending_day = False
                if period[1] != 1:
                    self.spec.frequency(period)
                return True
        self.pos = start
        return None

    def date_atom(self, base=None):
        start = self.pos
        result = read_date(self.tokens, start, base or self.today)
        if result:
            self.pos = result[1]
            return self.tokens[start : self.pos]
        raise ScheduleError(
            tr("complete_the_date_for_example_tomorrow_or_january_21"), "incomplete"
        )

    def bound(self, key):
        value = self.date_atom()
        if key in self.spec.bounds and [t.value for t in self.spec.bounds[key]] != [
            t.value for t in value
        ]:
            raise ScheduleError(tr("several_start_or_end_dates_were_specified_keep_one_of_each"))
        self.spec.bounds[key] = value

    def modifier(self):
        start = self.pos
        if self.take("a", "partir") or self.take("a", "compter"):
            self.directive = True
            if self.peek() in {"de", "du"}:
                self.pos += 1
            self.bound("start")
            return True
        if self.peek() == "des":
            # Accent folding must not turn the article in "des plantes" into "dès".
            # Keep accentless date bounds when a date actually follows.
            explicit = self.tokens[self.pos].original == "dès"
            previous_directive = self.directive
            self.directive = True
            if not explicit and not read_date(self.tokens, self.pos + 1, self.today):
                self.directive = previous_directive
                return None
            self.pos += 1
            self.bound("start")
            return True
        if self.take("jusqu"):
            self.directive = True
            self.take("'")
            if self.peek() in {"au", "a"}:
                self.pos += 1
            self.bound("end")
            return True
        if self.peek() == "du" and not self.weekday(self.tokens, self.pos + 1):
            self.pos += 1
            result = read_date(self.tokens, self.pos, self.today)
            if result:
                self.bound("start")
                if not self.take("au"):
                    raise ScheduleError(tr("complete_the_from_to_period"), "incomplete")
                self.bound("end")
                return True
            self.pos = start
        if self.peek() in {"pour", "pendant", "durant"}:
            self.directive = True
            introducer = self.peek()
            self.pos += 1
            amount = number(self.tokens, self.pos)
            if amount:
                count, self.pos = amount
                if not 1 <= count <= 10000:
                    raise ScheduleError(
                        tr("choose_an_occurrence_count_or_duration_between_1_and_10000")
                    )
                if self.peek() in {"fois", "occurrence", "occurrences"}:
                    self.pos += 1
                    if self.spec.count is not None and self.spec.count != count:
                        raise ScheduleError(tr("several_occurrence_counts_were_specified"))
                    self.spec.count = count
                    return True
                period = unit(self.tokens, self.pos)
                if period:
                    self.pos += 1
                    duration = period[0], period[1] * count
                    if self.spec.duration and self.spec.duration != duration:
                        raise ScheduleError(tr("several_different_durations_were_specified"))
                    self.spec.duration = duration
                    return True
                raise ScheduleError(tr("add_a_unit_or_times_after_this_number"), "incomplete")
            if introducer != "pour" or not self.peek():
                raise ScheduleError(
                    tr("complete_the_duration_or_number_of_occurrences"), "incomplete"
                )
            self.pos = start
        amount = number(self.tokens, self.pos)
        if amount and word(self.tokens, amount[1]) in {"fois", "occurrence", "occurrences"}:
            following = word(self.tokens, amount[1] + 1)
            if following in {"par", "tous", "toutes", "chaque"}:
                self.intent = True
                if not 1 <= amount[0] <= 366 or self.spec.rate not in {None, amount[0]}:
                    raise ScheduleError(tr("check_the_requested_number_of_occurrences_per_period"))
                self.spec.rate, self.pos = amount[0], amount[1] + 1
                if self.take("par"):
                    period = unit(self.tokens, self.pos)
                    if not period:
                        raise ScheduleError(
                            tr("complete_times_per_week_per_month_or_per_year"),
                            "incomplete",
                        )
                    self.spec.frequency(period)
                    self.calendar_evidence = True
                    self.pos += 1
                return True
            if self.spec.count not in {None, amount[0]}:
                raise ScheduleError(tr("several_occurrence_counts_were_specified"))
            self.spec.count, self.pos = amount[0], amount[1] + 1
            return True
        if self.take("apres"):
            if self.peek() in {"chaque", "la"}:
                self.pos += 1
            if self.peek() not in {"resolution", "realisation", "achevement"}:
                if not self.peek() or any(
                    v.startswith(self.peek()) for v in ("resolution", "realisation")
                ):
                    raise ScheduleError(tr("complete_after_completion"), "incomplete")
                raise ScheduleError(
                    tr("for_an_interval_that_restarts_when_done_write_after_completion")
                )
            self.pos += 1
            self.spec.completion = True
            return True
        if self.peek() in {"sauf", "excepte", "hors"}:
            self.directive = True
            self.pos += 1
            return self.exclusion()
        self.pos = start
        return None

    def exclusion(self):
        self.article()
        if self.peek() in {"en", "de"}:
            self.pos += 1
        if self.peek() in {"ferie", "feries"} or (
            singular(self.peek()) == "jour" and singular(self.peek(1)) == "ferie"
        ):
            raise ScheduleError(
                tr("public_holidays_depend_on_the_local_calendar_add_their_dates_as_exceptions")
            )
        group = self.attempt(self.day_group)
        weekdays = group or self.list_of(self.weekday, cycle=7)
        if weekdays:
            self.spec.excluded_days.update(WEEKDAYS[d - 1] for d in weekdays)
            return True
        months = self.list_of(self.month, cycle=12)
        if months:
            self.spec.excluded_months.update(months)
            return True
        while True:
            self.take("du")
            self.article()
            first = self.date_atom()
            range_start = self.peek() == "au" or (
                self.peek() == "a" and self.peek(1) not in {"partir", "compter"}
            )
            last = None
            if range_start:
                self.pos += 1
                last = self.date_atom()
            self.spec.excluded_dates.append((first, last))
            if self.peek() not in {",", "et", "&"}:
                break
            before = self.pos
            self.pos += 1
            self.article()
            if not read_date(self.tokens, self.pos, self.today):
                self.pos = before
                break
        return True

    def clause(self):
        start = self.pos
        if self.attempt(self.modifier):
            return True
        if self.attempt(self.scope):
            return True
        prefix = self.peek() in {"tous", "toutes", "tout", "toute", "chaque"}
        self.prefix_active = prefix
        if prefix:
            self.intent = True
            self.pos += 1
            self.article()
        elif self.peek() == "les":
            self.intent = True
        if self.peek() in {"bimensuel", "bimensuelle", "bihebdomadaire"}:
            self.intent = True
            raise ScheduleError(
                tr("this_shortcut_is_ambiguous_specify_an_interval_or_the_days_you_want")
            )
        if prefix and singular(self.peek()) in {"heure", "minute", "seconde"}:
            raise ScheduleError(
                tr("recurrences_use_days_weeks_months_or_years_without_a_time_of_day")
            )
        if self.attempt(self.selector):
            return True
        cadence = self.attempt(self.cadence)
        if cadence:
            self.spec.frequency(cadence)
            return True
        if prefix:
            if self.peek() and self.pos < len(self.tokens):
                vocabulary = [
                    *DAY_NAMES,
                    *MONTHS,
                    *ALIASES,
                    "jour",
                    "semaine",
                    "mois",
                    "annee",
                    "premier",
                    "dernier",
                    "deux",
                    "trois",
                    "quatre",
                    "cinq",
                    "six",
                ]
                if not any(value.startswith(self.peek()) for value in vocabulary):
                    if self.calendar_evidence:
                        raise ScheduleError(
                            tr(
                                "part_of_this_expression_is_not_recognized_specify_its_interval_or_days"
                            )
                        )
                    self.barrier = True
                    self.pos = start
                    return None
            raise ScheduleError(
                tr("complete_the_recurrence_with_an_interval_a_day_or_a_position_in"),
                "incomplete",
            )
        self.pos = start
        return None

    def parse(self):
        while self.pos < len(self.tokens):
            before = self.pos
            separator = self.peek() in {",", "et", "&"} and self.pos > self.start
            if separator:
                self.pos += 1
            if not self.clause():
                self.pos = before
                break
            if self.pos <= before:
                raise AssertionError("A calendar clause must consume input")
        if self.intent and self.pos > self.start:
            if self.peek() in {"heure", "heures", "minute", "minutes", "ferie", "feries"}:
                raise ScheduleError(
                    tr(
                        "this_schedule_accepts_dates_without_times_or_an_automatic_public_holiday_calendar"
                    )
                )
            if not self.calendar_evidence:
                if not self.peek():
                    raise ScheduleError(
                        tr("add_a_unit_or_of_the_month_after_the_number"), "incomplete"
                    )
                return None
            if self.pending_day:
                raise ScheduleError(
                    tr("complete_the_number_with_a_unit_or_of_the_month"), "incomplete"
                )
            # A recognised cadence followed by an unfinished selector is not a valid prefix.
            if self.peek() in {"le", "les", "en", "de", "du", "a", "sur", "sauf", "jusqu"}:
                raise ScheduleError(
                    tr("complete_the_calendar_details_before_applying_the_recurrence"),
                    "incomplete",
                )
            return self.spec
        return None
