from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.run_site_selection_counterfactual import (
    evaluate_scenario,
    facility_table_from_scenario,
    summarize,
)
from src.facilities.operations import load_operations


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run one-at-a-time sensitivity and Monte Carlo uncertainty analysis."
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
        "--operations-config",
        type=Path,
        default=Path("configs/facility_operations.json"),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs/haidian/validation/sensitivity_uncertainty"),
    )
    parser.add_argument("--scenario-method", default="balanced_network")
    parser.add_argument("--scenario-size", type=int, default=20)
    parser.add_argument("--monte-carlo-iterations", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def evaluate(
    results: pd.DataFrame,
    segments: pd.DataFrame,
    facilities: pd.DataFrame,
    method: str,
    size: int,
    config: dict[str, object],
    service_radius_m: float,
    capacity_multiplier: float,
    use_probability_multiplier: float,
    effect_multiplier: float,
    demand_expansion_multiplier: float,
) -> dict[str, object]:
    scenario_config = copy.deepcopy(config)
    scenario_config["simulated_activity_to_hourly_demand_expansion_factor"] = (
        float(config.get("simulated_activity_to_hourly_demand_expansion_factor", 1.0))
        * demand_expansion_multiplier
    )
    frame = evaluate_scenario(
        results,
        segments,
        facilities,
        method,
        size,
        service_radius_m,
        25.0,
        65.0,
        scenario_config,
        capacity_multiplier,
        use_probability_multiplier,
        effect_multiplier,
    )
    return {
        **summarize(frame),
        "service_radius_m": service_radius_m,
        "capacity_multiplier": capacity_multiplier,
        "use_probability_multiplier": use_probability_multiplier,
        "effect_multiplier": effect_multiplier,
        "demand_expansion_multiplier": demand_expansion_multiplier,
    }


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    results = pd.read_csv(args.run_dir / "agent_standalone_results.csv", low_memory=False)
    segments = pd.read_csv(args.run_dir / "route_segments.csv", low_memory=False)
    scenarios = pd.read_csv(args.site_dir / "facility_scenarios.csv", low_memory=False)
    candidates = pd.read_csv(args.site_dir / "candidate_scores.csv", low_memory=False)
    config = load_operations(args.operations_config)
    facilities = facility_table_from_scenario(
        candidates, scenarios, args.scenario_method, args.scenario_size, args.seed
    )

    baseline = {
        "service_radius_m": 500.0,
        "capacity_multiplier": 1.0,
        "use_probability_multiplier": 1.0,
        "effect_multiplier": 1.0,
        "demand_expansion_multiplier": 1.0,
    }
    experiments = [("baseline", baseline)]
    for parameter, values in {
        "service_radius_m": [300.0, 700.0],
        "capacity_multiplier": [0.5, 1.5],
        "use_probability_multiplier": [0.7, 1.3],
        "effect_multiplier": [0.7, 1.3],
        "demand_expansion_multiplier": [0.5, 2.0],
    }.items():
        for value in values:
            settings = dict(baseline)
            settings[parameter] = value
            experiments.append((f"{parameter}_{value}", settings))
    sensitivity_rows = []
    for name, settings in experiments:
        sensitivity_rows.append(
            {
                "experiment": name,
                **evaluate(
                    results,
                    segments,
                    facilities,
                    args.scenario_method,
                    args.scenario_size,
                    config,
                    **settings,
                ),
            }
        )
    sensitivity = pd.DataFrame(sensitivity_rows)
    baseline_row = sensitivity.iloc[0]
    for metric in [
        "activities_served_rate",
        "mean_exposure_reduction",
        "failed_activity_recovery_rate",
        "high_risk_resolved_rate",
    ]:
        sensitivity[f"{metric}_change_from_baseline"] = sensitivity[metric] - baseline_row[metric]
    sensitivity.to_csv(
        args.output_dir / "one_at_a_time_sensitivity.csv", index=False, encoding="utf-8-sig"
    )

    rng = np.random.default_rng(args.seed)
    monte_carlo_rows = []
    for iteration in range(args.monte_carlo_iterations):
        settings = {
            "service_radius_m": float(rng.triangular(300, 500, 700)),
            "capacity_multiplier": float(rng.triangular(0.5, 1.0, 1.5)),
            "use_probability_multiplier": float(rng.triangular(0.7, 1.0, 1.3)),
            "effect_multiplier": float(rng.triangular(0.7, 1.0, 1.3)),
            "demand_expansion_multiplier": float(rng.triangular(0.5, 1.0, 2.0)),
        }
        monte_carlo_rows.append(
            {
                "iteration": iteration + 1,
                **evaluate(
                    results,
                    segments,
                    facilities,
                    args.scenario_method,
                    args.scenario_size,
                    config,
                    **settings,
                ),
            }
        )
    monte_carlo = pd.DataFrame(monte_carlo_rows)
    monte_carlo.to_csv(
        args.output_dir / "monte_carlo_results.csv", index=False, encoding="utf-8-sig"
    )
    uncertainty_rows = []
    for metric in [
        "activities_served_rate",
        "mean_exposure_reduction",
        "total_exposure_reduction",
        "failed_activity_recovery_rate",
        "high_risk_resolved_rate",
    ]:
        uncertainty_rows.append(
            {
                "metric": metric,
                "mean": float(monte_carlo[metric].mean()),
                "standard_deviation": float(monte_carlo[metric].std()),
                "p05": float(monte_carlo[metric].quantile(0.05)),
                "median": float(monte_carlo[metric].median()),
                "p95": float(monte_carlo[metric].quantile(0.95)),
            }
        )
    uncertainty = pd.DataFrame(uncertainty_rows)
    uncertainty.to_csv(
        args.output_dir / "uncertainty_intervals.csv", index=False, encoding="utf-8-sig"
    )
    summary = {
        "scenario_method": args.scenario_method,
        "scenario_size": args.scenario_size,
        "sensitivity_experiments": len(sensitivity),
        "monte_carlo_iterations": args.monte_carlo_iterations,
        "uncertain_parameters": [
            "service_radius_m",
            "capacity_multiplier",
            "use_probability_multiplier",
            "effect_multiplier",
            "demand_expansion_multiplier",
        ],
        "hourly_demand_expansion_factor": config.get(
            "simulated_activity_to_hourly_demand_expansion_factor", 1.0
        ),
        "interpretation": "Results quantify model sensitivity to transparent operational priors; they do not replace empirical uncertainty calibration.",
    }
    (args.output_dir / "sensitivity_uncertainty_metadata.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    indexed = uncertainty.set_index("metric")
    baseline_result = sensitivity.iloc[0]
    report = f"""# 设施选址敏感性与不确定性分析

## 基准情景

- 方案：{args.scenario_method}，设施数量 {args.scenario_size}
- 活动服务覆盖率：{baseline_result['activities_served_rate']:.2%}
- 平均暴露削减：{baseline_result['mean_exposure_reduction']:.4f}
- 失效活动恢复率：{baseline_result['failed_activity_recovery_rate']:.2%}

## 蒙特卡洛不确定性区间

| 指标 | 均值 | P05 | P95 |
|---|---:|---:|---:|
| 活动服务覆盖率 | {indexed.loc['activities_served_rate', 'mean']:.2%} | {indexed.loc['activities_served_rate', 'p05']:.2%} | {indexed.loc['activities_served_rate', 'p95']:.2%} |
| 平均暴露削减 | {indexed.loc['mean_exposure_reduction', 'mean']:.4f} | {indexed.loc['mean_exposure_reduction', 'p05']:.4f} | {indexed.loc['mean_exposure_reduction', 'p95']:.4f} |
| 总暴露削减 | {indexed.loc['total_exposure_reduction', 'mean']:.2f} | {indexed.loc['total_exposure_reduction', 'p05']:.2f} | {indexed.loc['total_exposure_reduction', 'p95']:.2f} |
| 失效活动恢复率 | {indexed.loc['failed_activity_recovery_rate', 'mean']:.2%} | {indexed.loc['failed_activity_recovery_rate', 'p05']:.2%} | {indexed.loc['failed_activity_recovery_rate', 'p95']:.2%} |

## 解释边界

分析中的容量、使用概率、干预效力和客流扩展系数属于透明情景先验。区间反映模型参数不确定性，
不能替代真实设施运营和使用数据形成的经验置信区间。
"""
    (args.output_dir / "sensitivity_uncertainty_report.md").write_text(
        report, encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(uncertainty.to_string(index=False))


if __name__ == "__main__":
    main()
