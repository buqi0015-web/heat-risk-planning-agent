from __future__ import annotations

import pandas as pd


def min_max_normalize(series: pd.Series, positive: bool = True) -> pd.Series:
    """Normalize a numeric series to 0-1."""
    min_value = series.min()
    max_value = series.max()
    if max_value == min_value:
        return pd.Series(0.0, index=series.index)
    normalized = (series - min_value) / (max_value - min_value)
    return normalized if positive else 1 - normalized


def weighted_sum(df: pd.DataFrame, columns: list[str], weights: dict[str, float] | None = None) -> pd.Series:
    """Calculate weighted sum for selected columns."""
    if not columns:
        return pd.Series(0.0, index=df.index)
    if weights is None:
        weights = {col: 1 / len(columns) for col in columns}
    result = pd.Series(0.0, index=df.index)
    for col in columns:
        result = result + df[col] * weights.get(col, 0.0)
    return result


def calculate_heat_risk(
    df: pd.DataFrame,
    exposure_cols: list[str],
    sensitivity_cols: list[str],
    adaptation_cols: list[str],
    alpha: float = 1 / 3,
    beta: float = 1 / 3,
    gamma: float = 1 / 3,
) -> pd.DataFrame:
    """Calculate heat risk index as HRI = alpha*E + beta*S + gamma*(1-A)."""
    result = df.copy()
    result["exposure_index"] = weighted_sum(result, exposure_cols)
    result["sensitivity_index"] = weighted_sum(result, sensitivity_cols)
    result["adaptation_index"] = weighted_sum(result, adaptation_cols)
    result["heat_risk_raw"] = (
        alpha * result["exposure_index"]
        + beta * result["sensitivity_index"]
        + gamma * (1 - result["adaptation_index"])
    )
    result["heat_risk_index"] = min_max_normalize(result["heat_risk_raw"], positive=True)
    return result

