from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd


def load_calibration_config(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def classify_activity(purpose: str, purpose_groups: dict[str, list[str]], residual_group: str) -> str:
    for group, purposes in purpose_groups.items():
        if purpose in purposes:
            return group
    return residual_group


def apply_public_stats_calibration(
    results: pd.DataFrame,
    config: dict[str, Any],
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    calibrated = results.copy()
    target = config["activity_category_share"]
    purpose_groups = config["purpose_groups"]
    residual_group = config.get("residual_group", "other_modeled_activity")

    calibrated["activity_category"] = calibrated["trip_purpose"].astype(str).map(
        lambda purpose: classify_activity(purpose, purpose_groups, residual_group)
    )
    observed_counts = calibrated["activity_category"].value_counts()
    total = max(int(len(calibrated)), 1)
    observed_shares = observed_counts / total

    raw_factors: dict[str, float] = {}
    for category, target_share in target.items():
        observed_share = float(observed_shares.get(category, 0.0))
        raw_factors[category] = float(target_share) / observed_share if observed_share > 0 else 0.0

    calibrated["calibration_weight"] = calibrated["activity_category"].map(raw_factors).fillna(1.0).astype(float)
    weight_sum = float(calibrated["calibration_weight"].sum())
    if weight_sum > 0:
        calibrated["calibration_weight"] *= len(calibrated) / weight_sum

    weighted_counts = calibrated.groupby("activity_category")["calibration_weight"].sum()
    weighted_total = max(float(weighted_counts.sum()), 1.0)
    weighted_shares = weighted_counts / weighted_total

    diagnostic_rows: list[dict[str, Any]] = []
    for category, target_share in target.items():
        observed_share = float(observed_shares.get(category, 0.0))
        calibrated_share = float(weighted_shares.get(category, 0.0))
        diagnostic_rows.append(
            {
                "calibration_dimension": "activity_category_share",
                "category": category,
                "target_share": float(target_share),
                "unweighted_share": observed_share,
                "calibrated_share": calibrated_share,
                "unweighted_absolute_error": abs(observed_share - float(target_share)),
                "calibrated_absolute_error": abs(calibrated_share - float(target_share)),
                "raw_adjustment_factor": raw_factors.get(category, 0.0),
                "source_id": config.get("source_id", ""),
                "source_type": config.get("source_type", ""),
            }
        )

    diagnostics = pd.DataFrame(diagnostic_rows)
    metadata = {
        "method": "post_stratification_by_activity_category",
        "source_id": config.get("source_id", ""),
        "source_title": config.get("source_title", ""),
        "source_url": config.get("source_url", ""),
        "source_type": config.get("source_type", ""),
        "target_scope": config.get("target_scope", ""),
        "applicability_note": config.get("applicability_note", ""),
        "uncalibrated_dimensions": config.get("uncalibrated_dimensions", []),
        "mean_unweighted_absolute_error": float(diagnostics["unweighted_absolute_error"].mean()),
        "mean_calibrated_absolute_error": float(diagnostics["calibrated_absolute_error"].mean()),
        "minimum_calibration_weight": float(calibrated["calibration_weight"].min()),
        "maximum_calibration_weight": float(calibrated["calibration_weight"].max()),
        "effective_sample_size": float(
            calibrated["calibration_weight"].sum() ** 2
            / max(float((calibrated["calibration_weight"] ** 2).sum()), 1e-12)
        ),
        "missing_target_categories": [
            category for category in target if float(observed_shares.get(category, 0.0)) == 0.0
        ],
    }
    return calibrated, diagnostics, metadata


def weighted_summary(results: pd.DataFrame) -> pd.DataFrame:
    return (
        results.groupby(["agent_label", "trip_label", "action"], dropna=False)
        .agg(
            simulated_count=("activity_id", "size"),
            calibrated_count=("calibration_weight", "sum"),
        )
        .reset_index()
        .sort_values(["agent_label", "trip_label", "calibrated_count"], ascending=[True, True, False])
    )


def attach_calibration_weight(table: pd.DataFrame, results: pd.DataFrame) -> pd.DataFrame:
    if table.empty or "activity_id" not in table.columns:
        return table
    weights = results[["activity_id", "activity_category", "calibration_weight"]].drop_duplicates("activity_id")
    return table.drop(columns=["activity_category", "calibration_weight"], errors="ignore").merge(
        weights,
        on="activity_id",
        how="left",
    )
