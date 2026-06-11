from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.facilities.operations import (
    facility_profile,
    load_operations,
    operational_effectiveness,
)

INTERVENTION_EFFECT = {
    "清凉中心": 0.40,
    "清凉驿站": 0.28,
    "遮阴": 0.30,
    "饮水": 0.12,
    "公厕": 0.05,
    "助餐": 0.20,
    "健康服务": 0.25,
    "充电补给": 0.05,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Estimate model-based counterfactual effects of selected cooling facilities."
    )
    parser.add_argument(
        "--run-dir",
        type=Path,
        default=Path("outputs/haidian/agent_runs/spatially_constrained_final_v2"),
    )
    parser.add_argument(
        "--site-dir",
        type=Path,
        default=Path("outputs/haidian/site_selection/final_v1"),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs/haidian/counterfactual/final_v1"),
    )
    parser.add_argument("--service-radius-m", type=float, default=500)
    parser.add_argument("--risky-threshold", type=float, default=25)
    parser.add_argument("--failed-threshold", type=float, default=65)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--operations-config",
        type=Path,
        default=Path("configs/facility_operations.json"),
    )
    parser.add_argument("--capacity-multiplier", type=float, default=1.0)
    parser.add_argument("--use-probability-multiplier", type=float, default=1.0)
    parser.add_argument("--effect-multiplier", type=float, default=1.0)
    return parser.parse_args()


def split_values(value: object) -> set[str]:
    if pd.isna(value):
        return set()
    return {item.strip() for item in str(value).split(";") if item.strip()}


def effect_for_match(needs: set[str], functions: set[str]) -> tuple[float, set[str]]:
    matched = needs.intersection(functions)
    if not matched:
        return 0.0, matched
    remaining = 1.0
    for function in matched:
        remaining *= 1.0 - INTERVENTION_EFFECT.get(function, 0.0)
    return min(0.55, 1.0 - remaining), matched


def counterfactual_status(exposure: float, risky_threshold: float, failed_threshold: float) -> str:
    if exposure >= failed_threshold:
        return "failed"
    if exposure >= risky_threshold:
        return "risky_completion"
    return "normal"


def facility_table_from_scenario(
    candidates: pd.DataFrame,
    scenarios: pd.DataFrame,
    method: str,
    size: int,
    seed: int,
) -> pd.DataFrame:
    if method in {"agent_effective_coverage", "balanced_network"}:
        return scenarios[
            (scenarios["scenario_method"] == method)
            & (pd.to_numeric(scenarios["scenario_size"]) == size)
        ].copy()
    if method == "random":
        return candidates.sample(frac=1.0, random_state=seed).head(size).copy()
    if method == "path_heat_priority":
        return candidates.sort_values(
            ["exposure_interruption", "candidate_score"], ascending=False
        ).head(size).copy()
    if method == "rule_candidate_score":
        return candidates.sort_values("candidate_score", ascending=False).head(size).copy()
    raise ValueError(f"Unknown method: {method}")


def project_points(frame: pd.DataFrame, lon: str, lat: str) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        frame.copy(),
        geometry=gpd.points_from_xy(frame[lon], frame[lat]),
        crs=4326,
    ).to_crs(32650)


def evaluate_scenario(
    results: pd.DataFrame,
    segments: pd.DataFrame,
    facilities: pd.DataFrame,
    method: str,
    size: int,
    service_radius_m: float,
    risky_threshold: float,
    failed_threshold: float,
    operations_config: dict[str, object],
    capacity_multiplier: float,
    use_probability_multiplier: float,
    effect_multiplier: float,
) -> pd.DataFrame:
    facility_gdf = project_points(facilities, "lon", "lat")
    facility_tree = cKDTree(
        np.column_stack([facility_gdf.geometry.x, facility_gdf.geometry.y])
    )
    facility_functions = [
        split_values(value) for value in facility_gdf["function_categories"]
    ]
    facility_profiles = [
        facility_profile(record, operations_config)
        for record in facility_gdf.itertuples(index=False)
    ]
    activity_points = project_points(
        pd.DataFrame(
            {
                "lon": (
                    pd.to_numeric(results["origin_lon"], errors="coerce")
                    + pd.to_numeric(results["destination_lon"], errors="coerce")
                )
                / 2,
                "lat": (
                    pd.to_numeric(results["origin_lat"], errors="coerce")
                    + pd.to_numeric(results["destination_lat"], errors="coerce")
                )
                / 2,
            }
        ),
        "lon",
        "lat",
    )
    activity_tree = cKDTree(
        np.column_stack([activity_points.geometry.x, activity_points.geometry.y])
    )
    expected_hourly_demand = [
        len(activity_tree.query_ball_point([geometry.x, geometry.y], r=service_radius_m))
        / 6.0
        * float(
            operations_config.get(
                "simulated_activity_to_hourly_demand_expansion_factor", 1.0
            )
        )
        for geometry in facility_gdf.geometry
    ]
    segment_groups = {
        activity_id: group.copy()
        for activity_id, group in segments.groupby("activity_id", sort=False)
    }
    rows: list[dict[str, object]] = []

    for activity in results.itertuples(index=False):
        needs = split_values(getattr(activity, "facility_needs", ""))
        needs |= split_values(getattr(activity, "suitable_facility_types", ""))
        # Translate detailed need text using the categories already attached to
        # candidate-demand relations where possible.
        broad_needs = set()
        text = " ".join(needs)
        for category, keywords in {
            "清凉中心": ["清凉中心", "党群服务", "社区服务", "图书馆", "文化空间"],
            "清凉驿站": ["驿站", "休息", "短停", "等候"],
            "遮阴": ["遮阴", "遮阳", "清凉路径"],
            "饮水": ["饮水"],
            "公厕": ["公厕", "公共厕所"],
            "助餐": ["助餐", "食堂", "餐"],
            "健康服务": ["健康", "卫生", "医疗", "急救", "无障碍"],
            "充电补给": ["充电", "补给", "便利店"],
        }.items():
            if any(keyword in text for keyword in keywords):
                broad_needs.add(category)

        route_reduction = 0.0
        matched_functions: set[str] = set()
        served_facility_ids: set[str] = set()
        operational_effects: list[float] = []
        use_probabilities: list[float] = []
        capacity_factors: list[float] = []
        open_matches: list[float] = []
        group = segment_groups.get(activity.activity_id)
        if group is not None and not group.empty:
            road = group[group["segment_type"].astype(str) == "road_edge"].copy()
            if not road.empty:
                road["mid_lon"] = (
                    pd.to_numeric(road["from_lon"], errors="coerce")
                    + pd.to_numeric(road["to_lon"], errors="coerce")
                ) / 2
                road["mid_lat"] = (
                    pd.to_numeric(road["from_lat"], errors="coerce")
                    + pd.to_numeric(road["to_lat"], errors="coerce")
                ) / 2
                road_gdf = project_points(road, "mid_lon", "mid_lat")
                for (_, segment), geometry in zip(road.iterrows(), road_gdf.geometry):
                    nearby = facility_tree.query_ball_point(
                        [geometry.x, geometry.y], r=service_radius_m
                    )
                    best_effect = 0.0
                    best_matched: set[str] = set()
                    best_index = None
                    best_operational = None
                    for facility_index in nearby:
                        base_effect, matched = effect_for_match(
                            broad_needs, facility_functions[facility_index]
                        )
                        operational = operational_effectiveness(
                            base_effect=base_effect,
                            departure_time=activity.departure_time,
                            trip_type=activity.trip_type,
                            matched_functions=matched,
                            profile=facility_profiles[facility_index],
                            config=operations_config,
                            expected_hourly_demand=expected_hourly_demand[facility_index],
                            capacity_multiplier=capacity_multiplier,
                            use_probability_multiplier=use_probability_multiplier,
                            effect_multiplier=effect_multiplier,
                        )
                        effect = float(operational["operational_effectiveness"])
                        if effect > best_effect:
                            best_effect = effect
                            best_matched = matched
                            best_index = facility_index
                            best_operational = operational
                    segment_exposure = float(segment.get("segment_heat_exposure", 0.0))
                    route_reduction += segment_exposure * best_effect
                    matched_functions |= best_matched
                    if best_index is not None and best_operational is not None:
                        served_facility_ids.add(
                            str(facility_gdf.iloc[best_index]["candidate_id"])
                        )
                        operational_effects.append(float(best_operational["operational_effectiveness"]))
                        use_probabilities.append(float(best_operational["use_probability"]))
                        capacity_factors.append(float(best_operational["capacity_factor"]))
                        open_matches.append(float(best_operational["open_match"]))

        destination_point = project_points(
            pd.DataFrame(
                [{"lon": activity.destination_lon, "lat": activity.destination_lat}]
            ),
            "lon",
            "lat",
        ).geometry.iloc[0]
        destination_nearby = facility_tree.query_ball_point(
            [destination_point.x, destination_point.y], r=service_radius_m
        )
        destination_effect = 0.0
        for facility_index in destination_nearby:
            base_effect, matched = effect_for_match(
                broad_needs, facility_functions[facility_index]
            )
            operational = operational_effectiveness(
                base_effect=base_effect,
                departure_time=activity.departure_time,
                trip_type=activity.trip_type,
                matched_functions=matched,
                profile=facility_profiles[facility_index],
                config=operations_config,
                expected_hourly_demand=expected_hourly_demand[facility_index],
                capacity_multiplier=capacity_multiplier,
                use_probability_multiplier=use_probability_multiplier,
                effect_multiplier=effect_multiplier,
            )
            effect = float(operational["operational_effectiveness"])
            if effect > destination_effect:
                destination_effect = effect
            matched_functions |= matched
            if matched:
                served_facility_ids.add(str(facility_gdf.iloc[facility_index]["candidate_id"]))
                operational_effects.append(effect)
                use_probabilities.append(float(operational["use_probability"]))
                capacity_factors.append(float(operational["capacity_factor"]))
                open_matches.append(float(operational["open_match"]))

        route_before = float(activity.route_cumulative_heat_exposure)
        dwell_before = float(activity.destination_dwell_heat_exposure)
        route_after = max(0.0, route_before - route_reduction)
        dwell_after = max(0.0, dwell_before * (1.0 - destination_effect))
        before = float(activity.before_exposure)
        after = route_after + dwell_after
        status_after = counterfactual_status(after, risky_threshold, failed_threshold)
        rows.append(
            {
                "scenario_method": method,
                "scenario_size": size,
                "activity_id": activity.activity_id,
                "agent_id": activity.agent_id,
                "agent_type": activity.agent_type,
                "trip_purpose": activity.trip_purpose,
                "failure_zone_type": activity.failure_zone_type,
                "baseline_activity_status": activity.activity_status,
                "counterfactual_activity_status": status_after,
                "before_exposure": before,
                "counterfactual_exposure": after,
                "exposure_reduction": before - after,
                "exposure_reduction_rate": (before - after) / before if before > 0 else 0.0,
                "route_exposure_before": route_before,
                "route_exposure_after": route_after,
                "destination_exposure_before": dwell_before,
                "destination_exposure_after": dwell_after,
                "matched_functions": ";".join(sorted(matched_functions)),
                "served_facility_count": len(served_facility_ids),
                "mean_operational_effectiveness": float(np.mean(operational_effects))
                if operational_effects
                else 0.0,
                "mean_facility_use_probability": float(np.mean(use_probabilities))
                if use_probabilities
                else 0.0,
                "mean_capacity_factor": float(np.mean(capacity_factors))
                if capacity_factors
                else 0.0,
                "facility_open_match_rate": float(np.mean(open_matches))
                if open_matches
                else 0.0,
                "activity_recovered": activity.activity_status == "failed"
                and status_after != "failed",
                "high_risk_resolved": activity.activity_status
                in {"failed", "risky_completion"}
                and status_after == "normal",
            }
        )
    return pd.DataFrame(rows)


def summarize(counterfactual: pd.DataFrame) -> dict[str, object]:
    baseline_failed = counterfactual["baseline_activity_status"].eq("failed")
    baseline_high_risk = counterfactual["baseline_activity_status"].isin(
        ["failed", "risky_completion"]
    )
    weights = pd.to_numeric(
        counterfactual.get("calibration_weight", 1.0), errors="coerce"
    )
    served = counterfactual["served_facility_count"].gt(0)
    return {
        "scenario_method": counterfactual["scenario_method"].iloc[0],
        "scenario_size": int(counterfactual["scenario_size"].iloc[0]),
        "activities": len(counterfactual),
        "activities_served_rate": float(
            counterfactual["served_facility_count"].gt(0).mean()
        ),
        "mean_exposure_reduction": float(counterfactual["exposure_reduction"].mean()),
        "mean_exposure_reduction_rate": float(
            counterfactual["exposure_reduction_rate"].mean()
        ),
        "mean_facility_use_probability": float(
            counterfactual.loc[served, "mean_facility_use_probability"].mean()
        )
        if served.any()
        else 0.0,
        "mean_capacity_factor": float(
            counterfactual.loc[served, "mean_capacity_factor"].mean()
        )
        if served.any()
        else 0.0,
        "facility_open_match_rate": float(
            counterfactual.loc[served, "facility_open_match_rate"].mean()
        )
        if served.any()
        else 0.0,
        "total_exposure_reduction": float(counterfactual["exposure_reduction"].sum()),
        "baseline_failed_activities": int(baseline_failed.sum()),
        "counterfactual_failed_activities": int(
            counterfactual["counterfactual_activity_status"].eq("failed").sum()
        ),
        "failed_activity_recovery_rate": float(
            counterfactual.loc[baseline_failed, "activity_recovered"].mean()
        )
        if baseline_failed.any()
        else 0.0,
        "baseline_high_risk_activities": int(baseline_high_risk.sum()),
        "high_risk_resolved_rate": float(
            counterfactual.loc[baseline_high_risk, "high_risk_resolved"].mean()
        )
        if baseline_high_risk.any()
        else 0.0,
    }


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    results = pd.read_csv(args.run_dir / "agent_standalone_results.csv", low_memory=False)
    segments = pd.read_csv(args.run_dir / "route_segments.csv", low_memory=False)
    scenarios = pd.read_csv(args.site_dir / "facility_scenarios.csv", low_memory=False)
    candidates = pd.read_csv(args.site_dir / "candidate_scores.csv", low_memory=False)
    operations_config = load_operations(args.operations_config)

    methods = [
        "random",
        "path_heat_priority",
        "rule_candidate_score",
        "agent_effective_coverage",
        "balanced_network",
    ]
    sizes = [5, 10, 20]
    all_results: list[pd.DataFrame] = []
    summaries: list[dict[str, object]] = []
    for method in methods:
        for size in sizes:
            facilities = facility_table_from_scenario(
                candidates, scenarios, method, size, args.seed
            )
            evaluated = evaluate_scenario(
                results,
                segments,
                facilities,
                method,
                size,
                args.service_radius_m,
                args.risky_threshold,
                args.failed_threshold,
                operations_config,
                args.capacity_multiplier,
                args.use_probability_multiplier,
                args.effect_multiplier,
            )
            all_results.append(evaluated)
            summaries.append(summarize(evaluated))

    counterfactual = pd.concat(all_results, ignore_index=True)
    summary = pd.DataFrame(summaries)
    counterfactual.to_csv(
        args.output_dir / "counterfactual_activity_results.csv",
        index=False,
        encoding="utf-8-sig",
    )
    summary.to_csv(
        args.output_dir / "counterfactual_scenario_summary.csv",
        index=False,
        encoding="utf-8-sig",
    )
    metadata = {
        "status": "model_based_counterfactual_not_external_validation",
        "service_radius_m": args.service_radius_m,
        "intervention_effect_assumptions": INTERVENTION_EFFECT,
        "operations_config": str(args.operations_config),
        "capacity_multiplier": args.capacity_multiplier,
        "use_probability_multiplier": args.use_probability_multiplier,
        "effect_multiplier": args.effect_multiplier,
        "simulated_activity_to_hourly_demand_expansion_factor": operations_config.get(
            "simulated_activity_to_hourly_demand_expansion_factor", 1.0
        ),
        "scenario_methods": methods,
        "scenario_sizes": sizes,
        "external_validation_status": "deferred_until_real_observed_data_available",
    }
    (args.output_dir / "run_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    best = summary.sort_values(
        ["failed_activity_recovery_rate", "mean_exposure_reduction"],
        ascending=False,
    ).iloc[0]
    report = f"""# 清凉设施运行约束反事实验证

设施反事实效力同时受到开放时间、居民使用概率和容量因子的约束。设施位于服务半径内不再自动产生收益。

当前恢复率和暴露削减表现最高的方案为 `{best['scenario_method']}`，设施数量
{int(best['scenario_size'])}。其活动服务覆盖率为 {best['activities_served_rate']:.2%}，
平均暴露削减为 {best['mean_exposure_reduction']:.4f}，失效活动恢复率为
{best['failed_activity_recovery_rate']:.2%}。

容量和使用概率来源于透明先验配置 `{args.operations_config}`，尚需设施开放时间、小时接待量和
真实使用记录进行校准。
"""
    (args.output_dir / "operational_counterfactual_report.md").write_text(
        report, encoding="utf-8"
    )
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
