from __future__ import annotations

import math
import random
from dataclasses import dataclass


ACTION_SET = (
    "normal",
    "risky_completion",
    "cancel",
    "delay",
    "substitute",
    "shorten",
    "add_stop",
)

ALLOWED_ACTIONS = {
    "fixed_time_necessary": ("normal", "risky_completion", "shorten", "add_stop"),
    "flexible_necessary": ("normal", "risky_completion", "delay", "substitute", "shorten", "add_stop"),
    "leisure": ("normal", "cancel", "delay", "substitute", "shorten", "add_stop"),
    "outdoor_work": ("normal", "risky_completion", "shorten", "add_stop"),
    "accompanied_trip": ("normal", "risky_completion", "delay", "shorten", "add_stop"),
}


@dataclass(frozen=True)
class HeatDecisionContext:
    trip_type: str
    heat_stress: float
    activity_necessity: float
    time_rigidity: float
    route_flexibility: float
    personal_vulnerability: float
    cooling_accessibility: float
    cooling_match: float
    stop_probability: float
    detour_minutes: float
    detour_tolerance_minutes: float


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _detour_penalty(context: HeatDecisionContext) -> float:
    tolerance = max(0.1, context.detour_tolerance_minutes)
    return max(0.0, context.detour_minutes) / tolerance


def action_scores(context: HeatDecisionContext) -> dict[str, float]:
    """Return transparent initial-prior scores for allowed heat-response actions.

    Coefficients are deliberately simple and must be calibrated against observed
    aggregate behavior before the simulation is treated as empirical evidence.
    """
    heat = clamp(context.heat_stress) * max(0.5, context.personal_vulnerability)
    necessity = clamp(context.activity_necessity)
    rigidity = clamp(context.time_rigidity)
    flexibility = clamp(context.route_flexibility)
    stop_fit = (
        clamp(context.cooling_accessibility)
        * clamp(context.cooling_match)
        * clamp(context.stop_probability)
        * math.exp(-_detour_penalty(context))
    )

    scores = {
        "normal": 1.5 * (1.0 - heat),
        "risky_completion": 2.0 * heat * necessity * rigidity * (1.0 - stop_fit),
        "cancel": 2.0 * heat * (1.0 - necessity) * (1.0 - rigidity),
        "delay": 1.5 * heat * (1.0 - rigidity),
        "substitute": 1.3 * heat * flexibility * necessity,
        "shorten": 1.1 * heat * (0.5 + flexibility) * necessity,
        "add_stop": 2.0 * heat * necessity * stop_fit,
    }
    allowed = ALLOWED_ACTIONS[context.trip_type]
    return {action: scores[action] for action in allowed}


def action_probabilities(context: HeatDecisionContext) -> dict[str, float]:
    if context.heat_stress <= 0:
        return {
            action: 1.0 if action == "normal" else 0.0
            for action in ALLOWED_ACTIONS[context.trip_type]
        }
    scores = action_scores(context)
    maximum = max(scores.values())
    weights = {action: math.exp(score - maximum) for action, score in scores.items()}
    total = sum(weights.values())
    return {action: weight / total for action, weight in weights.items()}


def choose_action(context: HeatDecisionContext, seed: int | None = None) -> str:
    probabilities = action_probabilities(context)
    rng = random.Random(seed)
    threshold = rng.random()
    cumulative = 0.0
    for action, probability in probabilities.items():
        cumulative += probability
        if threshold <= cumulative:
            return action
    return next(reversed(probabilities))
