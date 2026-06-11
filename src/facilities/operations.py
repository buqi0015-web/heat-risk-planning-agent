from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any


def load_operations(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def clock_to_minute(value: object) -> int:
    try:
        hour, minute = str(value).split(":")[:2]
        return int(hour) * 60 + int(minute)
    except (TypeError, ValueError):
        return 0


def is_open(departure_time: object, intervals: list[str]) -> bool:
    minute = clock_to_minute(departure_time)
    for interval in intervals:
        start, end = interval.split("-", 1)
        if clock_to_minute(start) <= minute <= clock_to_minute(end):
            return True
    return False


def facility_profile(record: object, config: dict[str, Any]) -> dict[str, Any]:
    role = str(getattr(record, "candidate_role", "") or "")
    base = dict(config["default"])
    base.update(config.get("candidate_role", {}).get(role, {}))
    publicness = str(getattr(record, "publicness", "") or "").lower()
    base["publicness_multiplier"] = config.get("publicness_multiplier", {}).get(
        publicness, 0.6
    )
    return base


def function_probability(
    matched_functions: set[str], config: dict[str, Any]
) -> float:
    if not matched_functions:
        return 0.0
    values = [
        float(config.get("function_use_probability", {}).get(function, 0.5))
        for function in matched_functions
    ]
    return max(values)


def expected_use_probability(
    trip_type: str,
    matched_functions: set[str],
    profile: dict[str, Any],
    config: dict[str, Any],
    use_probability_multiplier: float = 1.0,
) -> float:
    probability = (
        float(profile["base_use_probability"])
        * float(profile["publicness_multiplier"])
        * function_probability(matched_functions, config)
        * float(config.get("trip_type_use_multiplier", {}).get(trip_type, 0.6))
        * use_probability_multiplier
    )
    return max(0.0, min(1.0, probability))


def capacity_factor(
    expected_hourly_demand: float,
    capacity_visits_per_hour: float,
    capacity_multiplier: float = 1.0,
) -> float:
    capacity = max(0.0, capacity_visits_per_hour * capacity_multiplier)
    if expected_hourly_demand <= 0:
        return 1.0
    return max(0.0, min(1.0, capacity / expected_hourly_demand))


def operational_effectiveness(
    base_effect: float,
    departure_time: object,
    trip_type: str,
    matched_functions: set[str],
    profile: dict[str, Any],
    config: dict[str, Any],
    expected_hourly_demand: float,
    capacity_multiplier: float = 1.0,
    use_probability_multiplier: float = 1.0,
    effect_multiplier: float = 1.0,
) -> dict[str, float | bool]:
    open_match = is_open(departure_time, profile["open_intervals"])
    use_probability = expected_use_probability(
        trip_type,
        matched_functions,
        profile,
        config,
        use_probability_multiplier,
    )
    capacity_match = capacity_factor(
        expected_hourly_demand,
        float(profile["capacity_visits_per_hour"]),
        capacity_multiplier,
    )
    effectiveness = (
        base_effect
        * float(open_match)
        * use_probability
        * capacity_match
        * effect_multiplier
    )
    return {
        "open_match": open_match,
        "use_probability": use_probability,
        "capacity_factor": capacity_match,
        "operational_effectiveness": max(0.0, min(1.0, effectiveness)),
        "capacity_visits_per_hour": float(profile["capacity_visits_per_hour"])
        * capacity_multiplier,
    }
