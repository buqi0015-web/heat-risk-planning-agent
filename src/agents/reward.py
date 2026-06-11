from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RewardTerms:
    trip_distribution_error: float
    elderly_pattern_error: float
    school_escort_error: float
    impossible_action_rate: float
    excessive_detour_rate: float
    counterfactual_improvement: float


def calibration_reward(terms: RewardTerms) -> float:
    """Reward for calibrating behavior parameters against aggregate evidence.

    This is designed for parameter search or lightweight reinforcement learning.
    It should not be used until baseline simulation outputs are available.
    """
    return (
        -0.25 * terms.trip_distribution_error
        -0.20 * terms.elderly_pattern_error
        -0.15 * terms.school_escort_error
        -0.20 * terms.impossible_action_rate
        -0.10 * terms.excessive_detour_rate
        +0.10 * terms.counterfactual_improvement
    )
