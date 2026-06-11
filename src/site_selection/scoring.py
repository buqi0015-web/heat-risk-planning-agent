from __future__ import annotations

import pandas as pd


DEFAULT_WEIGHTS = {
    "failure_demand_coverage": 0.25,
    "demand_match": 0.20,
    "exposure_interruption": 0.20,
    "reuse_potential": 0.15,
    "scarcity_improvement": 0.10,
    "vulnerable_relevance": 0.10,
    "conflict_risk": -0.05,
}


def score_candidates(df: pd.DataFrame, weights: dict[str, float] | None = None) -> pd.DataFrame:
    """Score candidate POIs for reuse as cooling service nodes."""
    weights = weights or DEFAULT_WEIGHTS
    result = df.copy()
    score = pd.Series(0.0, index=result.index)
    for col, weight in weights.items():
        if col in result.columns:
            score = score + result[col] * weight
    result["candidate_score"] = score
    result = result.sort_values("candidate_score", ascending=False)
    result["rank"] = range(1, len(result) + 1)
    return result
