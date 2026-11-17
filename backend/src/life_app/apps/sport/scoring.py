"""Versioned, dimensionless effort ratios; references stay inside the saved metrics."""

from math import sqrt
from statistics import mean

from life_app.apps.sport.kinds import SPECS, performance

RATE_QUANTITIES = {
    "distance_duration": "distance_m",
    "reps_duration": "reps",
    "calories_duration": "calories",
}


def effort_ratio(kind, values, reference):
    if quantity := RATE_QUANTITIES.get(kind):
        volume = values[quantity] / reference[quantity]
        pace = volume * reference["duration_seconds"] / values["duration_seconds"]
        return volume * min(1.5, sqrt(pace))
    return performance(kind, [values]) / performance(kind, [reference])


def calculate(entries, records, previous_metrics=()):
    """Zero-filled sets never calibrate a reference or contribute performed effort."""
    result = []
    for i, entry in enumerate(entries):
        performed = {
            r["set_index"]: r["values"]
            for r in records
            if r["entry_index"] == i and not r.get("skipped", False)
        }
        previous = previous_metrics[i].get("scoring") if previous_metrics else None
        references = []
        ratio_sum = 0.0
        for j in range(entry["sets"]):
            old = previous["references"][j] if previous else {}
            values, sources = dict(old.get("values", {})), dict(old.get("sources", {}))
            suggestions = entry.get("suggested_values", [])
            suggested = (suggestions[j] if j < len(suggestions) else None) or {}
            for field in SPECS[entry["kind"]]:
                if field in values:
                    continue
                if entry["target"].get(field) is not None:
                    values[field], sources[field] = entry["target"][field], "target"
                elif suggested.get(field) is not None:
                    values[field], sources[field] = suggested[field], "history"
                elif performed:
                    values[field] = (
                        performed[j][field]
                        if j in performed
                        else mean(v[field] for v in performed.values())
                    )
                    sources[field] = "initial"
            references.append(dict(values=values, sources=sources))
            if j in performed:
                ratio_sum += effort_ratio(entry["kind"], performed[j], values)
        result.append(
            dict(
                version=2,
                planned_sets=entry["sets"],
                completed_sets=len(performed),
                effort_ratio_sum=ratio_sum,
                references=references,
            )
        )
    return result


def summarize(metrics):
    scores = [metric.get("scoring") for metric in metrics]
    if not scores or not all(scores):
        return None
    planned = sum(s["planned_sets"] for s in scores)
    completed = sum(s["completed_sets"] for s in scores)
    effort = sum(s["effort_ratio_sum"] for s in scores)
    return dict(
        version=2,
        planned_sets=planned,
        completed_sets=completed,
        completion_percent=round(100 * completed / planned, 2),
        difficulty_percent=round(100 * effort / completed, 2) if completed else None,
        score=round(100 * effort / planned, 2),
    )
