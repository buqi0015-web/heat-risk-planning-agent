from __future__ import annotations

import random


PATH_PREFERENCE_PROFILES = {
    "rational": {
        "label": "效率优先型",
        "distance_weight": 1.00,
        "heat_weight": 0.20,
        "shade_deficit_weight": 0.10,
        "water_distance_weight": 0.02,
    },
    "heat_averse": {
        "label": "热风险规避型",
        "distance_weight": 0.85,
        "heat_weight": 1.20,
        "shade_deficit_weight": 0.45,
        "water_distance_weight": 0.08,
    },
    "cooling_seeking": {
        "label": "清凉环境偏好型",
        "distance_weight": 0.75,
        "heat_weight": 0.75,
        "shade_deficit_weight": 0.90,
        "water_distance_weight": 0.20,
    },
    "stable_route": {
        "label": "稳定路径型",
        "distance_weight": 0.95,
        "heat_weight": 0.45,
        "shade_deficit_weight": 0.25,
        "water_distance_weight": 0.05,
    },
    "exploratory": {
        "label": "弹性探索型",
        "distance_weight": 0.70,
        "heat_weight": 0.55,
        "shade_deficit_weight": 0.50,
        "water_distance_weight": 0.12,
    },
}


PATH_PROFILE_WEIGHTS_BY_AGENT = {
    "elderly_living_alone": {"heat_averse": 0.45, "cooling_seeking": 0.35, "stable_route": 0.20},
    "elderly_chronic_disease": {"heat_averse": 0.60, "cooling_seeking": 0.30, "stable_route": 0.10},
    "child_parent": {"rational": 0.45, "heat_averse": 0.30, "stable_route": 0.25},
    "university_student": {"rational": 0.35, "exploratory": 0.40, "cooling_seeking": 0.25},
    "household_maintainer": {"stable_route": 0.40, "heat_averse": 0.30, "rational": 0.30},
    "outdoor_worker": {"rational": 0.45, "stable_route": 0.35, "heat_averse": 0.20},
    "commuter": {"rational": 0.65, "stable_route": 0.25, "heat_averse": 0.10},
}


def sample_path_preference(agent_type: str, rng: random.Random) -> tuple[str, dict[str, float | str]]:
    weights = PATH_PROFILE_WEIGHTS_BY_AGENT[agent_type]
    threshold = rng.random() * sum(weights.values())
    cumulative = 0.0
    selected = next(iter(weights))
    for profile, weight in weights.items():
        cumulative += weight
        if threshold <= cumulative:
            selected = profile
            break
    return selected, PATH_PREFERENCE_PROFILES[selected]
