"""Period snapshots, explicit corrections and scoring owned entirely by Tracking."""

from collections import defaultdict
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select

from life_app.apps.tracking import models as m
from life_app.apps.tracking import schemas as s
from life_app.apps.tracking.messages import tr
from life_app.core.database import utcnow
from life_app.platform.integrations import service as integrations
from life_app.platform.integrations.periods import period
from life_app.platform.integrations.schemas import Evaluation, MetricValue


def today(timezone):
    return utcnow().astimezone(ZoneInfo(timezone)).date()


def settings(db, user):
    return db.get(m.TrackingSettings, user.id) or s.Settings()


def owned(db, user, id):
    item = db.scalar(select(m.Tracker).where(m.Tracker.id == id, m.Tracker.owner_id == user.id))
    if item is None:
        raise HTTPException(404, tr("not_found"))
    return item


def version(item, expected):
    if item.version != expected:
        raise HTTPException(409, tr("conflict"))


def output(item):
    return s.TrackerOutput(
        **item.definition,
        id=item.id,
        version=item.version,
        position=item.position,
        archived_at=item.archived_at,
        effective_from=item.effective_from,
        created_at=item.created_at,
    )


def trackers(db, user, archived=False):
    return db.scalars(
        select(m.Tracker)
        .where(
            m.Tracker.owner_id == user.id,
            m.Tracker.archived_at.is_not(None) if archived else m.Tracker.archived_at.is_(None),
        )
        .order_by(m.Tracker.position, m.Tracker.created_at, m.Tracker.id)
    ).all()


def ensure_capacity(db, user):
    count = db.scalar(
        select(func.count())
        .select_from(m.Tracker)
        .where(m.Tracker.owner_id == user.id, m.Tracker.archived_at.is_(None))
    )
    if count >= 50:
        raise HTTPException(422, tr("limit"))


def source_query(field, definition, day):
    frequency = definition.frequency if field.source.period == "tracking" else field.source.period
    start, end = period(day, frequency)
    return Evaluation(
        **field.source.model_dump(exclude={"period"}),
        since=start,
        until=end,
        timezone=definition.timezone,
    )


def validate_sources(db, user, definitions, payload, previous=None):
    old = {f["id"]: f for f in previous["fields"]} if previous else {}
    for field in payload.fields:
        before = old.get(field.id)
        if before and (before["kind"] != field.kind or before["unit"] != field.unit):
            raise HTTPException(422, tr("invalid"))
        if field.source and (
            not before or before.get("source") != field.source.model_dump(mode="json")
        ):
            value = integrations.evaluate(
                db, user, definitions, source_query(field, payload, today(payload.timezone))
            )
            if field.unit != value.unit:
                raise HTTPException(422, tr("invalid"))


def record_definition(db, item, enabled=True):
    db.add(
        m.TrackerRevision(
            tracker_id=item.id,
            revision=item.version,
            effective_from=item.effective_from,
            enabled=enabled,
            definition=item.definition,
        )
    )


def create_tracker(db, user, definitions, payload):
    ensure_capacity(db, user)
    validate_sources(db, user, definitions, payload)
    position = (
        db.scalar(
            select(func.coalesce(func.max(m.Tracker.position), -1)).where(
                m.Tracker.owner_id == user.id
            )
        )
        + 1
    )
    item = m.Tracker(
        owner_id=user.id,
        definition=payload.model_dump(mode="json"),
        effective_from=payload.start_date,
        position=position,
    )
    db.add(item)
    db.flush()
    record_definition(db, item)
    return item


def update_tracker(db, user, definitions, item, payload):
    version(item, payload.expected_version)
    if item.archived_at:
        raise HTTPException(409, tr("inactive"))
    data = s.TrackerInput.model_validate(payload.model_dump(exclude={"expected_version"}))
    if any(
        item.definition[k] != data.model_dump(mode="json")[k]
        for k in ("frequency", "timezone", "start_date")
    ):
        raise HTTPException(422, tr("immutable"))
    validate_sources(db, user, definitions, data, item.definition)
    # A definition becomes effective from the current local date. An already saved
    # period uses its own immutable definition; older missing periods use revisions.
    item.definition = data.model_dump(mode="json")
    item.effective_from = max(today(data.timezone), data.start_date)
    item.version += 1
    record_definition(db, item)
    return item


def archive(db, user, item, payload):
    version(item, payload.expected_version)
    if bool(item.archived_at) == payload.archived:
        return item
    if not payload.archived:
        ensure_capacity(db, user)
    item.archived_at = utcnow() if payload.archived else None
    item.effective_from = max(
        today(item.definition["timezone"]), date.fromisoformat(item.definition["start_date"])
    )
    item.version += 1
    record_definition(db, item, not payload.archived)
    return item


def due_fields(definition, day):
    return [
        f
        for f in definition.fields
        if definition.frequency != "daily" or day.weekday() in f.weekdays
    ]


def field_score(field, value):
    goal = field.goal
    if goal is None or value is None:
        return None
    if goal.mode == "equals":
        return float(
            type(value) is type(goal.target)
            and value == goal.target
            or type(value) in (int, float)
            and type(goal.target) in (int, float)
            and value == goal.target
        )
    if goal.mode == "at_least":
        distance = max(0, goal.target - value)
    elif goal.mode == "at_most":
        distance = max(0, value - goal.target)
    else:
        distance = max(goal.target - value, value - goal.upper, 0)
    return max(0, 1 - distance / goal.tolerance)


def goal_score(goals):
    # Optional, unanswered goals do not penalise a score. Required answers still
    # contribute to the denominator, so a partial entry cannot appear perfect.
    goals = [(f, v) for f, v in goals if f.required or v is not None]
    if not goals or not any(v is not None for _, v in goals):
        return None
    value = (
        10
        * sum((field_score(f, v) or 0) * f.weight for f, v in goals)
        / sum(f.weight for f, _ in goals)
    )
    perfect = all(field_score(f, v) == 1 for f, v in goals)
    return 10.0 if perfect else min(9.99, round(value, 2))


def scoring(definition, day, values):
    fields = due_fields(definition, day)
    expected = [f for f in fields if f.required]
    filled = sum(values.get(f.id) is not None for f in expected)
    score = goal_score([(f, values.get(f.id)) for f in fields if f.goal])
    return filled, len(expected), score


def entry_output(item):
    definition = s.TrackerInput.model_validate(item.definition)
    filled, expected, score = scoring(definition, item.period_start, item.values)
    xp = (10 + round(2 * (score or 0))) if item.status == "complete" else 0
    return s.EntryOutput(
        id=item.id,
        tracker_id=item.tracker_id,
        period_start=item.period_start,
        period_end=item.period_end,
        definition=definition,
        values=item.values,
        sources=item.sources,
        version=item.version,
        status=item.status,
        created_at=item.created_at,
        updated_at=item.updated_at,
        completed_at=item.completed_at,
        score=score,
        filled=filled,
        expected=expected,
        xp=xp,
    )


def revisions(db, items):
    result = defaultdict(list)
    if items:
        for row in db.scalars(
            select(m.TrackerRevision)
            .where(m.TrackerRevision.tracker_id.in_([i.id for i in items]))
            .order_by(m.TrackerRevision.effective_from, m.TrackerRevision.revision)
        ):
            result[row.tracker_id].append(row)
    return result


def resolve(item, rows, day, entry=None):
    base = s.TrackerInput.model_validate(item.definition)
    start, end = period(day, base.frequency)
    if end < base.start_date:
        return None
    if entry:
        definition = s.TrackerInput.model_validate(entry.definition)
    else:
        anchor = max(start, base.start_date)
        # Archive/resume affects the occurrence from the selected date while already
        # saved periods keep their original snapshot. Configuration changes apply at
        # the next period boundary for periods which have already begun.
        candidates = [r for r in rows if r.effective_from <= anchor]
        if not candidates or not candidates[-1].enabled:
            return None
        definition = s.TrackerInput.model_validate(candidates[-1].definition)
    fields = due_fields(definition, start)
    if not fields:
        return None
    return s.Occurrence(
        tracker_id=item.id,
        definition=definition,
        period_start=start,
        period_end=end,
        fields=fields,
        entry=entry_output(entry) if entry else None,
    )


def get_occurrence(db, user, item, day):
    if not date(2000, 1, 1) <= day <= date(2100, 12, 31):
        raise HTTPException(422, tr("invalid"))
    base = s.TrackerInput.model_validate(item.definition)
    start, _ = period(day, base.frequency)
    entry = db.scalar(
        select(m.Entry).where(
            m.Entry.tracker_id == item.id,
            m.Entry.owner_id == user.id,
            m.Entry.period_start == start,
        )
    )
    result = resolve(item, revisions(db, [item])[item.id], day, entry)
    if result is None:
        raise HTTPException(404, tr("inactive"))
    return result, entry


def source_values(db, user, definitions, occurrence, day):
    values = {}
    for field in occurrence.fields:
        if not field.source:
            continue
        query = source_query(field, occurrence.definition, day)
        try:
            value = integrations.evaluate(db, user, definitions, query)
        except HTTPException as exc:
            if exc.status_code not in {404, 409, 422}:
                raise
            value = MetricValue(state="unavailable", observed_at=utcnow(), message=str(exc.detail))
        values[field.id] = s.SourceSnapshot(query=query, result=value)
    return values


def preview(db, user, definitions, item, day):
    occurrence, _ = get_occurrence(db, user, item, day)
    if max(occurrence.period_start, occurrence.definition.start_date) > today(
        occurrence.definition.timezone
    ):
        raise HTTPException(422, tr("future"))
    occurrence.sources = source_values(db, user, definitions, occurrence, day)
    return occurrence


def validate_value(field, value):
    if value is None:
        return
    if field.kind == "boolean":
        valid = type(value) is bool
    elif field.kind == "choice":
        valid = type(value) is str and value in field.options
    elif field.kind == "note":
        valid = type(value) is str and len(value) <= 4000
    else:
        valid = type(value) in (int, float) and field.minimum <= value <= field.maximum
    if not valid:
        raise HTTPException(422, tr("value", label=field.label))


def write_entry(db, user, definitions, item, day, payload):
    occurrence, entry = get_occurrence(db, user, item, day)
    if max(occurrence.period_start, occurrence.definition.start_date) > today(
        occurrence.definition.timezone
    ) or day > today(occurrence.definition.timezone):
        raise HTTPException(422, tr("future"))
    if payload.expected_version != (entry.version if entry else 0):
        raise HTTPException(409, tr("conflict"))
    fields = {f.id: f for f in occurrence.fields}
    if set(payload.values) - fields.keys():
        raise HTTPException(422, tr("invalid"))
    if any(fields[k].source for k in payload.values):
        raise HTTPException(422, tr("dynamic"))
    values = dict(entry.values) if entry else {}
    snapshots = dict(entry.sources) if entry else {}
    for name, value in payload.values.items():
        validate_value(fields[name], value)
        values[name] = value.strip() or None if isinstance(value, str) else value
    if entry is None or payload.refresh_sources or not snapshots:
        for name, snapshot in source_values(db, user, definitions, occurrence, day).items():
            snapshots[name] = snapshot.model_dump(mode="json")
            values[name] = snapshot.result.value if snapshot.result.state == "ok" else None
            validate_value(fields[name], values[name])
    filled, expected, _ = scoring(occurrence.definition, occurrence.period_start, values)
    if payload.complete and (filled < expected or not any(v is not None for v in values.values())):
        raise HTTPException(422, tr("required"))
    if entry is None:
        entry = m.Entry(
            owner_id=user.id,
            tracker_id=item.id,
            period_start=occurrence.period_start,
            period_end=occurrence.period_end,
            definition=occurrence.definition.model_dump(mode="json"),
            version=1,
        )
        db.add(entry)
    else:
        entry.version += 1
    entry.values = values
    entry.sources = snapshots
    entry.status = "complete" if payload.complete else "draft"
    entry.completed_at = (entry.completed_at or utcnow()) if payload.complete else None
    entry.updated_at = utcnow()
    db.flush()
    result = entry_output(entry)
    db.add(
        m.EntryRevision(
            entry_id=entry.id, version=entry.version, snapshot=result.model_dump(mode="json")
        )
    )
    return result


def current(db, user, day=None, include_archived=False):
    if day and not date(2000, 1, 1) <= day <= date(2100, 12, 31):
        raise HTTPException(422, tr("invalid"))
    items = trackers(db, user) + (trackers(db, user, True) if include_archived else [])
    revs = revisions(db, items)
    result = []
    for item in items:
        ref = day or today(item.definition["timezone"])
        if ref < date.fromisoformat(item.definition["start_date"]):
            continue
        start, _ = period(ref, item.definition["frequency"])
        entry = db.scalar(
            select(m.Entry).where(
                m.Entry.tracker_id == item.id,
                m.Entry.owner_id == user.id,
                m.Entry.period_start == start,
            )
        )
        occurrence = resolve(item, revs[item.id], ref, entry)
        if occurrence and occurrence.period_start <= today(occurrence.definition.timezone):
            result.append(occurrence)
    return result


def entries(db, user, since=None, until=None, tracker_id=None):
    sql = select(m.Entry).where(m.Entry.owner_id == user.id)
    if since:
        sql = sql.where(m.Entry.period_end >= since)
    if until:
        sql = sql.where(m.Entry.period_start <= until)
    if tracker_id:
        sql = sql.where(m.Entry.tracker_id == tracker_id)
    rows = db.scalars(sql.order_by(m.Entry.period_start, m.Entry.id).limit(20001)).all()
    if len(rows) > 20000:
        raise HTTPException(422, tr("limit"))
    return rows


def calendar(db, user, since, until, tracker_id=None):
    try:
        Evaluation(application_id="tracking", metric_id="calendar", since=since, until=until)
    except ValidationError:
        raise HTTPException(422, tr("invalid")) from None
    if (until - since).days > 366:
        raise HTTPException(422, tr("invalid"))
    items = db.scalars(
        select(m.Tracker)
        .where(m.Tracker.owner_id == user.id)
        .order_by(m.Tracker.position, m.Tracker.id)
    ).all()
    if tracker_id:
        owned(db, user, tracker_id)
        items = [i for i in items if i.id == tracker_id]
    revs = revisions(db, items)
    saved = {(e.tracker_id, e.period_start): e for e in entries(db, user, since, until, tracker_id)}
    now = today(settings(db, user).timezone)
    days = []
    long_periods = {}
    cursor = since
    while cursor <= until:
        occurrences = []
        for item in items:
            start, _ = period(cursor, item.definition["frequency"])
            if (item.id, start) in long_periods:
                continue
            occurrence = resolve(item, revs[item.id], cursor, saved.get((item.id, start)))
            if occurrence is None:
                continue
            if occurrence.definition.frequency != "daily":
                long_periods[(item.id, start)] = occurrence
            else:
                occurrences.append(occurrence)
        expected = len(occurrences)
        complete = sum(o.entry is not None and o.entry.status == "complete" for o in occurrences)
        field_count = sum(sum(f.required for f in o.fields) for o in occurrences)
        filled = sum(o.entry.filled for o in occurrences if o.entry)
        goals = [
            (f, o.entry.values.get(f.id) if o.entry else None)
            for o in occurrences
            for f in o.fields
            if f.goal
        ]
        score = goal_score(goals)
        state = (
            "rest"
            if not expected
            else "future"
            if cursor > now
            else "complete"
            if complete == expected
            else "partial"
            if any(o.entry for o in occurrences)
            else "missing"
        )
        days.append(
            s.DaySummary(
                date=cursor,
                state=state,
                completed=complete,
                expected=expected,
                filled=filled,
                fields=field_count,
                score=score,
            )
        )
        cursor += timedelta(days=1)
    return s.Calendar(
        since=since, until=until, today=now, days=days, periods=list(long_periods.values())
    )


def achievements(db, user):
    saved = [entry_output(e) for e in entries(db, user) if e.status == "complete"]
    xp = sum(e.xp for e in saved)
    perfect = sum(e.score == 10 for e in saved)
    now = today(settings(db, user).timezone)
    days = calendar(db, user, now - timedelta(days=365), now).days
    streak = best = run = 0
    for d in days:
        if d.state == "rest":
            continue
        if d.state == "complete":
            run += 1
            best = max(best, run)
        elif d.date != now:
            run = 0
    streak = run
    badges = []
    for name, target, value in [
        ("first", 1, len(saved)),
        ("regular", 7, len(saved)),
        ("dedicated", 30, len(saved)),
        ("century", 100, len(saved)),
        ("perfect", 10, perfect),
    ]:
        badges.append(
            s.Badge(
                id=name,
                name=tr(name),
                description=tr(name + "_description"),
                target=target,
                progress=min(target, value),
                earned=value >= target,
            )
        )
    return s.Achievement(
        xp=xp,
        level=xp // 250 + 1,
        next_level_xp=(xp // 250 + 1) * 250,
        completed_periods=len(saved),
        perfect_periods=perfect,
        streak=streak,
        best_streak=best,
        badges=badges,
    )


def statistics(db, user, since, until, tracker_id=None):
    cal = calendar(db, user, since, until, tracker_id)
    past = [d for d in cal.days if d.date <= cal.today]
    expected = sum(d.expected for d in past)
    completed = sum(d.completed for d in past)
    long_periods = [
        o for o in cal.periods if max(o.period_start, o.definition.start_date) <= cal.today
    ]
    expected += len(long_periods)
    completed += sum(o.entry is not None and o.entry.status == "complete" for o in long_periods)
    scores = [
        entry_output(e).score for e in entries(db, user, since, min(until, cal.today), tracker_id)
    ]
    scores = [score for score in scores if score is not None]
    trends = defaultdict(list)
    if tracker_id:
        for entry in entries(db, user, since, until, tracker_id):
            for field in s.TrackerInput.model_validate(entry.definition).fields:
                value = entry.values.get(field.id)
                if value is not None and field.kind not in {"note", "choice"}:
                    trends[field.id].append(
                        s.Point(
                            date=entry.period_start, value=value, label=field.label, unit=field.unit
                        )
                    )
    return s.Statistics(
        calendar=cal,
        completion_rate=round(100 * completed / expected, 1) if expected else None,
        average_score=round(sum(scores) / len(scores), 2) if scores else None,
        achievements=achievements(db, user),
        trends=[s.Trend(field_id=k, points=v) for k, v in trends.items()],
    )
