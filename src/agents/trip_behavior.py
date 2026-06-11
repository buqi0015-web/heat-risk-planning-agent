from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TripBehavior:
    label: str
    time_rigidity: float
    route_flexibility: float
    stop_probability: float
    detour_tolerance_minutes: float
    maximum_stop_minutes: float
    suitable_interventions: list[str] = field(default_factory=list)


TRIP_BEHAVIORS = {
    "fixed_time_necessary": TripBehavior(
        label="固定时间必要出行",
        time_rigidity=0.9,
        route_flexibility=0.2,
        stop_probability=0.1,
        detour_tolerance_minutes=3,
        maximum_stop_minutes=2,
        suitable_interventions=["原位遮阴", "候车遮阳", "校门等候点", "饮水点"],
    ),
    "flexible_necessary": TripBehavior(
        label="弹性时间必要出行",
        time_rigidity=0.5,
        route_flexibility=0.5,
        stop_probability=0.5,
        detour_tolerance_minutes=8,
        maximum_stop_minutes=15,
        suitable_interventions=["清凉中心", "助餐中转", "健康服务", "休息点"],
    ),
    "leisure": TripBehavior(
        label="自由休闲出行",
        time_rigidity=0.2,
        route_flexibility=0.8,
        stop_probability=0.8,
        detour_tolerance_minutes=12,
        maximum_stop_minutes=30,
        suitable_interventions=["清凉中心", "公园驿站", "遮阴活动区"],
    ),
    "outdoor_work": TripBehavior(
        label="连续户外工作",
        time_rigidity=0.8,
        route_flexibility=0.5,
        stop_probability=0.7,
        detour_tolerance_minutes=5,
        maximum_stop_minutes=10,
        suitable_interventions=["清凉驿站", "饮水", "公厕", "充电"],
    ),
    "accompanied_trip": TripBehavior(
        label="陪护出行",
        time_rigidity=0.7,
        route_flexibility=0.3,
        stop_probability=0.4,
        detour_tolerance_minutes=5,
        maximum_stop_minutes=8,
        suitable_interventions=["原位遮阴", "短停节点", "无障碍休息"],
    ),
}


def intervention_match(trip_type: str, intervention: str) -> float:
    """Return 1 when an intervention matches a trip type, otherwise 0."""
    behavior = TRIP_BEHAVIORS[trip_type]
    return float(intervention in behavior.suitable_interventions)


def effective_stop_probability(
    trip_type: str,
    intervention: str,
    detour_minutes: float,
    open_time_match: float = 1.0,
) -> float:
    """Estimate whether a traveler will actually use a cooling intervention."""
    behavior = TRIP_BEHAVIORS[trip_type]
    if detour_minutes > behavior.detour_tolerance_minutes:
        return 0.0
    return (
        behavior.stop_probability
        * intervention_match(trip_type, intervention)
        * max(0.0, min(1.0, open_time_match))
    )


def effective_coverage(
    spatial_accessibility: float,
    trip_type: str,
    intervention: str,
    detour_minutes: float,
    open_time_match: float = 1.0,
) -> float:
    """Calculate behavior-adjusted facility coverage."""
    return max(0.0, min(1.0, spatial_accessibility)) * effective_stop_probability(
        trip_type=trip_type,
        intervention=intervention,
        detour_minutes=detour_minutes,
        open_time_match=open_time_match,
    )

