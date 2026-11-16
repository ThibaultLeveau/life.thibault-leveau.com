"""A single transactional ledger; reads never award points or mutate history."""

from collections import Counter, defaultdict
from datetime import timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, select

from life_app.core.database import utcnow
from life_app.core.i18n import locale
from life_app.platform.applications.messages import tr as application_message
from life_app.platform.applications.service import find_application
from life_app.platform.integrations.service import active
from life_app.platform.progression import models as m
from life_app.platform.progression import schemas as s
from life_app.platform.progression.definition import STREAKS
from life_app.platform.progression.messages import tr


def settings(db, user):
    item = db.get(m.Preferences, user.id)
    return s.SettingsOutput(**(item.settings if item else {}), version=item.version if item else 0)


def save_settings(db, user, definitions, payload):
    ids = {d.id for d in definitions if d.progression is not None}
    if (set(payload.exclude_weekends) | set(payload.usage_days)) - ids:
        raise HTTPException(422, tr("invalid"))
    item = db.get(m.Preferences, user.id)
    if payload.expected_version != (item.version if item else 0):
        raise HTTPException(409, tr("conflict"))
    if item is None:
        item = m.Preferences(owner_id=user.id, version=0)
        db.add(item)
    updated = payload.model_dump(mode="json", exclude={"expected_version"})
    # Older clients cannot round-trip this field. Omitting it must not erase a schedule.
    if "usage_days" not in payload.model_fields_set:
        updated["usage_days"] = (item.settings or {}).get("usage_days", {})
    item.settings = updated
    item.version += 1
    db.flush()
    return settings(db, user)


def definition(db, user, definitions, application_id):
    item = find_application(definitions, application_id)
    if item.progression is None:
        raise HTTPException(404, tr("not_found"))
    if not active(db, user, item):
        raise HTTPException(
            403, application_message("this_application_is_disabled_enable_it_in_the_library")
        )
    return item


def threshold(level):
    n = level - 1
    return 100 * n + 25 * n * (n - 1) // 2


def level_for(xp):
    return max(level for level in range(1, 101) if threshold(level) <= xp)


def usage_days(preferences, app_id):
    return preferences.usage_days.get(
        app_id, list(range(5 if preferences.exclude_weekends.get(app_id, False) else 7))
    )


def neutral(day, preferences, app_id):
    return day.weekday() not in usage_days(preferences, app_id) or any(
        v.start <= day <= v.end for v in preferences.vacations
    )


def streaks(days, today, preferences, app_id):
    """Neutral dates neither increment nor break a streak; today has a grace period."""
    if not days:
        return 0, 0
    run = best = 0
    cursor = min(days)
    while cursor <= today:
        if not neutral(cursor, preferences, app_id):
            if cursor in days:
                run += 1
                best = max(best, run)
            elif cursor < today:
                run = 0
        cursor += timedelta(days=1)
    return run, best


def facts(db, user, app_id, preferences):
    counters = Counter()
    dimensions = defaultdict(set)
    days = set()
    query = (
        select(m.ActivityRecord)
        .where(m.ActivityRecord.owner_id == user.id, m.ActivityRecord.application_id == app_id)
        .execution_options(yield_per=1000)
    )
    for item in db.scalars(query):
        counters.update(item.counters)
        for key, values in item.dimensions.items():
            dimensions[key].update(values)
        days.add(item.day)
    counters.update({key: len(values) for key, values in dimensions.items()})
    today = utcnow().astimezone(ZoneInfo(preferences.timezone)).date()
    current, best = streaks(days, today, preferences, app_id)
    counters["active_days"] = len(days)
    counters["streak"] = best
    return counters, current, today in days, neutral(today, preferences, app_id)


def earned(db, user, app_id):
    return {
        r.source_key: r
        for r in db.scalars(
            select(m.Reward).where(
                m.Reward.owner_id == user.id,
                m.Reward.application_id == app_id,
                m.Reward.kind == "quest",
            )
        )
    }


def quest_outputs(provider, counters, rewards):
    result = []
    for quest in provider.quests:
        reward = rewards.get("quest:" + quest.id)
        progress = quest.target if reward else min(quest.target, counters[quest.metric])
        name, description = quest.text()
        result.append(
            s.QuestOutput(
                id=quest.id,
                name=name,
                description=description,
                category=quest.category,
                target=quest.target,
                progress=progress,
                xp=quest.xp,
                earned_at=reward.occurred_at if reward else None,
                ratio=round(progress / quest.target, 6),
            )
        )
    return result


def quests(db, user, app):
    counts, *_ = facts(db, user, app.id, settings(db, user))
    return quest_outputs(app.progression, counts, earned(db, user, app.id))


def summary(db, user, app):
    preferences = settings(db, user)
    counts, current, today_active, paused = facts(db, user, app.id, preferences)
    rewards = earned(db, user, app.id)
    items = quest_outputs(app.progression, counts, rewards)
    xp = db.scalar(
        select(func.coalesce(func.sum(m.Reward.xp), 0)).where(
            m.Reward.owner_id == user.id, m.Reward.application_id == app.id
        )
    )
    level = level_for(xp)
    titles = [
        s.Title(
            level=(i + 1) * 10,
            name=pair[locale() == "en"],
            xp=threshold((i + 1) * 10),
            earned=level >= (i + 1) * 10,
        )
        for i, pair in enumerate(app.progression.titles)
    ]
    closest = sorted(
        (q for q in items if q.earned_at is None), key=lambda q: (-q.ratio, q.target, q.id)
    )[:3]
    return s.Summary(
        application_id=app.id,
        name=app.localized_metadata()[0],
        icon=app.icon,
        xp=xp,
        level=level,
        title=next((t.name for t in reversed(titles) if t.earned), tr("novice")),
        level_xp=threshold(level),
        next_level_xp=threshold(level + 1) if level < 100 else None,
        level_progress=(xp - threshold(level)) / (threshold(level + 1) - threshold(level))
        if level < 100
        else 1,
        titles=titles,
        streak=current,
        best_streak=counts["streak"],
        next_streak=next((s for s in STREAKS if s > current), None),
        active_days=counts["active_days"],
        today_active=today_active,
        paused_today=paused,
        exclude_weekends=all(day < 5 for day in usage_days(preferences, app.id)),
        usage_days=usage_days(preferences, app.id),
        timezone=preferences.timezone,
        quests_earned=len(rewards),
        quests_total=len(items),
        closest=closest,
        base_xp=app.progression.base_xp,
        rules=app.progression.rules[locale() == "en"],
    )


def unlock(db, user, app_id, provider, *, imported=False):
    counters, *_ = facts(db, user, app_id, settings(db, user))
    rewards = earned(db, user, app_id)
    now = utcnow()
    for q in provider.quests:
        key = "quest:" + q.id
        if key not in rewards and counters[q.metric] >= q.target:
            db.add(
                m.Reward(
                    owner_id=user.id,
                    application_id=app_id,
                    source_key=key,
                    kind="quest",
                    xp=q.xp,
                    occurred_at=now,
                    imported=imported,
                )
            )
    db.flush()


def record(db, user, app_id, provider, activity, *, imported=False, award_quests=True):
    if activity is None:
        return False
    existing = db.scalar(
        select(m.ActivityRecord.id).where(
            m.ActivityRecord.owner_id == user.id,
            m.ActivityRecord.application_id == app_id,
            m.ActivityRecord.source_key == activity.key,
        )
    )
    if existing:
        return False
    preferences = settings(db, user)
    day = activity.occurred_at.astimezone(ZoneInfo(preferences.timezone)).date()
    db.add(
        m.ActivityRecord(
            owner_id=user.id,
            application_id=app_id,
            source_key=activity.key,
            occurred_at=activity.occurred_at,
            day=day,
            xp=activity.xp,
            counters=activity.counters,
            dimensions=activity.dimensions,
            imported=imported,
        )
    )
    db.add(
        m.Reward(
            owner_id=user.id,
            application_id=app_id,
            source_key="activity:" + activity.key,
            kind="activity",
            xp=activity.xp,
            occurred_at=activity.occurred_at,
            imported=imported,
        )
    )
    db.flush()
    if award_quests:
        unlock(db, user, app_id, provider, imported=imported)
    return True


def history(db, user, app, offset, limit):
    query = select(m.Reward).where(m.Reward.owner_id == user.id, m.Reward.application_id == app.id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    names = {"quest:" + q.id: q.text()[0] for q in app.progression.quests}
    rows = db.scalars(
        query.order_by(m.Reward.occurred_at.desc(), m.Reward.id.desc()).offset(offset).limit(limit)
    )
    return s.History(
        total=total,
        offset=offset,
        limit=limit,
        items=[
            s.RewardOutput(
                id=r.id,
                kind=r.kind,
                label=tr("activity")
                if r.kind == "activity"
                else tr("quest", name=names.get(r.source_key, r.source_key)),
                xp=r.xp,
                occurred_at=r.occurred_at,
                recorded_at=r.recorded_at,
                imported=r.imported,
            )
            for r in rows
        ],
    )


def backfill(db, user, definitions):
    """CLI holds the owner's write lock. One import per app, atomic and restartable."""
    for app in definitions:
        if app.progression is None or db.get(m.ImportState, (user.id, app.id)):
            continue
        for activity in app.progression.history(db, user):
            record(db, user, app.id, app.progression, activity, imported=True, award_quests=False)
        unlock(db, user, app.id, app.progression, imported=True)
        db.add(m.ImportState(owner_id=user.id, application_id=app.id))
        db.flush()


def preview_backfill(db, user, definitions):
    """Read-only, aggregate-only preview for a single explicitly named account."""
    result = []
    for app in definitions:
        if app.progression is None:
            continue
        seen = set(
            db.scalars(
                select(m.ActivityRecord.source_key).where(
                    m.ActivityRecord.owner_id == user.id, m.ActivityRecord.application_id == app.id
                )
            )
        )
        count = xp = 0
        if not db.get(m.ImportState, (user.id, app.id)):
            for activity in app.progression.history(db, user):
                if activity.key not in seen:
                    seen.add(activity.key)
                    count += 1
                    xp += activity.xp
        result.append({"application": app.id, "activities": count, "activity_xp": xp})
    return result
