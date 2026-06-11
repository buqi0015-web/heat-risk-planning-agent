from __future__ import annotations


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def effective_heat_hazard(
    base_heat_hazard: float,
    canopy_cover: float = 0.0,
    shade_cover: float = 0.0,
    water_cooling: float = 0.0,
    canopy_effect: float = 0.25,
    shade_effect: float = 0.35,
    water_effect: float = 0.10,
) -> float:
    """Adjust route or place-level heat hazard using local cooling conditions.

    Effect coefficients are scenario parameters and require sensitivity analysis
    or empirical calibration before being interpreted as measured cooling effects.
    """
    cooling = (
        clamp01(canopy_cover) * canopy_effect
        + clamp01(shade_cover) * shade_effect
        + clamp01(water_cooling) * water_effect
    )
    return clamp01(base_heat_hazard) * max(0.0, 1.0 - cooling)


def cumulative_heat_exposure(
    heat_hazard: float,
    outdoor_minutes: float,
    vulnerability_weight: float = 1.0,
) -> float:
    """Calculate activity-level cumulative heat exposure."""
    return heat_hazard * outdoor_minutes * vulnerability_weight


def route_segment_heat_exposure(
    segments: list[dict[str, float]],
    vulnerability_weight: float = 1.0,
) -> float:
    """Sum heat exposure across road or activity-place segments."""
    total = 0.0
    for segment in segments:
        hazard = effective_heat_hazard(
            base_heat_hazard=float(segment.get("base_heat_hazard", 0.0)),
            canopy_cover=float(segment.get("canopy_cover", 0.0)),
            shade_cover=float(segment.get("shade_cover", 0.0)),
            water_cooling=float(segment.get("water_cooling", 0.0)),
        )
        total += cumulative_heat_exposure(
            heat_hazard=hazard,
            outdoor_minutes=float(segment.get("outdoor_minutes", 0.0)),
            vulnerability_weight=vulnerability_weight,
        )
    return total


def failure_index(
    cumulative_exposure: float,
    activity_necessity: float,
    activity_frequency: float,
    adaptation_deficit: float,
) -> float:
    """Calculate activity failure priority index."""
    return (
        cumulative_exposure
        * activity_necessity
        * activity_frequency
        * adaptation_deficit
    )


def classify_activity_status(
    cumulative_exposure: float,
    risky_threshold: float,
    failure_threshold: float,
    behavior_changed: bool = False,
) -> str:
    """Classify activity as normal, risky completion, behavior changed, or failed."""
    if cumulative_exposure >= failure_threshold:
        return "failed"
    if behavior_changed:
        return "behavior_changed"
    if cumulative_exposure >= risky_threshold:
        return "risky_completion"
    return "normal"
