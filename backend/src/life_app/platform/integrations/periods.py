from calendar import monthrange
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from life_app.platform.integrations.schemas import Frequency


def period(day: date, frequency: Frequency) -> tuple[date, date]:
    if frequency == "weekly":
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=6)
    if frequency == "monthly":
        return day.replace(day=1), day.replace(day=monthrange(day.year, day.month)[1])
    if frequency == "yearly":
        return date(day.year, 1, 1), date(day.year, 12, 31)
    return day, day


def utc_window(since: date, until: date, timezone: str) -> tuple[datetime, datetime]:
    zone = ZoneInfo(timezone)
    return (
        datetime.combine(since, time.min, zone).astimezone(UTC),
        datetime.combine(until + timedelta(days=1), time.min, zone).astimezone(UTC),
    )
