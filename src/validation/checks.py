from __future__ import annotations

import pandas as pd


def poi_legality_rate(simulation_df: pd.DataFrame, matched_col: str = "matched_poi_valid") -> float:
    """Calculate ratio of simulated demands that can match real POIs."""
    if matched_col not in simulation_df.columns or simulation_df.empty:
        return 0.0
    return float(simulation_df[matched_col].mean())


def demand_stability(simulation_df: pd.DataFrame, demand_col: str = "facility_demand") -> pd.DataFrame:
    """Count high-frequency facility demands from simulation outputs."""
    if demand_col not in simulation_df.columns:
        return pd.DataFrame(columns=[demand_col, "count"])
    return simulation_df[demand_col].value_counts().reset_index(name="count")


def reduction_rate(before: float, after: float) -> float:
    """Calculate proportional reduction from before to after."""
    if before == 0:
        return 0.0
    return (before - after) / before


def activity_recovery_rate(before_status: pd.Series, after_status: pd.Series) -> float:
    """Calculate share of previously failed activities recovered after intervention."""
    failed_before = before_status.eq("failed")
    if failed_before.sum() == 0:
        return 0.0
    recovered = failed_before & after_status.isin(["normal", "risky_completion"])
    return float(recovered.sum() / failed_before.sum())


def benefit_per_facility(total_benefit: float, facility_count: int) -> float:
    """Calculate intervention benefit per selected facility."""
    if facility_count <= 0:
        return 0.0
    return total_benefit / facility_count
