from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.agents.behavior_model import ALLOWED_ACTIONS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Quantitatively validate simulated behavior using external targets and internal validity checks."
    )
    parser.add_argument(
        "--run-dir",
        type=Path,
        default=Path("outputs/haidian/agent_runs/spatially_constrained_final_v2"),
    )
    parser.add_argument(
        "--od-audit",
        type=Path,
        default=Path("outputs/haidian/validation/od_realism_final_v2/od_realism_audit_summary.json"),
    )
    parser.add_argument(
        "--segment-audit",
        type=Path,
        default=Path(
            "outputs/haidian/validation/segment_exposure_final_v2_audit/"
            "segment_exposure_audit_summary.json"
        ),
    )
    parser.add_argument(
        "--targets",
        type=Path,
        default=Path("configs/behavior_validation_targets.json"),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs/haidian/validation/behavior_quantitative"),
    )
    parser.add_argument("--bootstrap-iterations", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def bootstrap_mean_ci(values: pd.Series, iterations: int, seed: int) -> tuple[float, float]:
    numeric = pd.to_numeric(values, errors="coerce").dropna().to_numpy(dtype=float)
    if len(numeric) == 0:
        return 0.0, 0.0
    rng = np.random.default_rng(seed)
    means = np.array(
        [rng.choice(numeric, size=len(numeric), replace=True).mean() for _ in range(iterations)]
    )
    return float(np.quantile(means, 0.025)), float(np.quantile(means, 0.975))


def normalized_distribution(series: pd.Series, labels: list[str], weights: pd.Series | None = None) -> np.ndarray:
    if weights is None:
        counts = series.value_counts()
    else:
        counts = pd.DataFrame({"label": series, "weight": weights}).groupby("label")["weight"].sum()
    values = np.array([float(counts.get(label, 0.0)) for label in labels], dtype=float)
    if values.sum() <= 0:
        return np.full(len(values), 1.0 / len(values))
    values = np.maximum(values / values.sum(), 0.0)
    return values / values.sum()


def js_distance(left: np.ndarray, right: np.ndarray) -> float:
    left = np.maximum(left, 0.0)
    right = np.maximum(right, 0.0)
    left = left / left.sum()
    right = right / right.sum()
    middle = (left + right) / 2
    left_term = np.where(left > 0, left * np.log(left / middle), 0.0)
    right_term = np.where(right > 0, right * np.log(right / middle), 0.0)
    divergence = max(0.0, float((left_term.sum() + right_term.sum()) / 2))
    return float(np.sqrt(divergence))


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    results = pd.read_csv(args.run_dir / "agent_standalone_results.csv", low_memory=False)
    targets = json.loads(args.targets.read_text(encoding="utf-8"))
    od = json.loads(args.od_audit.read_text(encoding="utf-8"))
    segment = json.loads(args.segment_audit.read_text(encoding="utf-8"))

    results["action_rule_compliant"] = results.apply(
        lambda row: str(row["action"]) in ALLOWED_ACTIONS[str(row["trip_type"])], axis=1
    )
    first = results[results["activity_sequence"] == 1]
    first_proxy = first["origin_proxy_method"].isin(
        ["residential_poi_road_entry_proxy", "residential_building_road_entry_proxy"]
    )
    thresholds = targets["internal_thresholds"]
    internal = {
        "route_success_rate": float(results["route_method"].astype(str).str.startswith("road_network").mean()),
        "origin_traceability_rate": float(od["origin_source_traceability_rate"]),
        "destination_traceability_rate": float(od["destination_poi_traceability_rate"]),
        "purpose_distance_compliance_rate": float(od["within_purpose_max_distance_rate"]),
        "action_rule_compliance_rate": float(results["action_rule_compliant"].mean()),
        "road_environment_coverage_rate": float(segment["mean_route_environment_coverage"]),
        "first_origin_residential_proxy_rate": float(first_proxy.mean()),
    }
    internal_rows = []
    for metric, value in internal.items():
        threshold = float(thresholds[metric])
        internal_rows.append(
            {
                "metric": metric,
                "value": value,
                "threshold": threshold,
                "passed": value >= threshold,
            }
        )
    internal_frame = pd.DataFrame(internal_rows)

    labels = list(targets["external_activity_category_share"])
    observed = np.array([targets["external_activity_category_share"][label] for label in labels])
    unweighted = normalized_distribution(results["activity_category"], labels)
    calibrated = normalized_distribution(
        results["activity_category"],
        labels,
        pd.to_numeric(results["calibration_weight"], errors="coerce").fillna(1.0),
    )
    external = {
        "activity_category_labels": labels,
        "external_target": observed.tolist(),
        "unweighted_simulation": unweighted.tolist(),
        "calibrated_simulation": calibrated.tolist(),
        "unweighted_jensen_shannon_distance": js_distance(observed, unweighted),
        "calibrated_jensen_shannon_distance": js_distance(observed, calibrated),
        "unweighted_mean_absolute_error": float(np.abs(observed - unweighted).mean()),
        "calibrated_mean_absolute_error": float(np.abs(observed - calibrated).mean()),
    }

    heat_column = (
        "effective_activity_heat_stress"
        if "effective_activity_heat_stress" in results.columns
        else "heat_stress"
    )
    heat = pd.to_numeric(results[heat_column], errors="coerce")
    changed = ~results["action"].isin(["normal", "risky_completion"])
    quantile = pd.qcut(heat.rank(method="first"), q=min(5, len(results)), labels=False)
    heat_response = (
        pd.DataFrame({"heat_quantile": quantile, "heat": heat, "changed": changed.astype(float)})
        .groupby("heat_quantile")
        .agg(mean_heat_stress=("heat", "mean"), behavior_change_rate=("changed", "mean"), activities=("changed", "size"))
        .reset_index()
    )
    correlation = spearmanr(heat, changed.astype(float), nan_policy="omit")
    heat_response.to_csv(
        args.output_dir / "heat_response_monotonicity.csv", index=False, encoding="utf-8-sig"
    )

    ci_rows = []
    for metric, series in {
        "route_success_rate": results["route_method"].astype(str).str.startswith("road_network").astype(float),
        "action_rule_compliance_rate": results["action_rule_compliant"].astype(float),
        "purpose_distance_compliance_rate": pd.read_csv(
            args.od_audit.parent / "od_realism_audit_details.csv", low_memory=False
        )["within_purpose_max_distance"].astype(float),
        "mean_before_exposure": results["before_exposure"],
    }.items():
        low, high = bootstrap_mean_ci(series, args.bootstrap_iterations, args.seed)
        ci_rows.append({"metric": metric, "mean": float(pd.to_numeric(series).mean()), "ci_2_5": low, "ci_97_5": high})
    pd.DataFrame(ci_rows).to_csv(
        args.output_dir / "bootstrap_confidence_intervals.csv", index=False, encoding="utf-8-sig"
    )

    summary = {
        "activities": int(len(results)),
        "agents": int(results["agent_id"].nunique()),
        "internal_checks_passed": int(internal_frame["passed"].sum()),
        "internal_checks_total": int(len(internal_frame)),
        "internal_validity_score": float(internal_frame["passed"].mean()),
        "external_activity_share_validation": external,
        "heat_response_spearman_rho": float(correlation.statistic),
        "heat_response_spearman_pvalue": float(correlation.pvalue),
        "interpretation": (
            "Internal checks quantify traceability, rule compliance, route feasibility, and spatial plausibility. "
            "External activity-share agreement is macro calibration evidence. Neither replaces observed individual OD "
            "or heat-response validation."
        ),
        "limitations": targets["limitations"],
    }
    internal_frame.to_csv(
        args.output_dir / "internal_validity_checks.csv", index=False, encoding="utf-8-sig"
    )
    (args.output_dir / "behavior_validation_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    report = f"""# 行为模拟量化验证报告

## 结论

内部有效性检查通过 {summary['internal_checks_passed']}/{summary['internal_checks_total']} 项，
内部有效性得分为 {summary['internal_validity_score']:.2%}。该得分反映模型内部一致性、
空间可追溯性与行为规则合规性。

校准后的活动类别分布与北京公开统计目标之间的 Jensen-Shannon 距离为
{external['calibrated_jensen_shannon_distance']:.6f}；未校准结果为
{external['unweighted_jensen_shannon_distance']:.6f}。

热压力与行为调整之间的 Spearman 相关系数为 {summary['heat_response_spearman_rho']:.4f}
（p={summary['heat_response_spearman_pvalue']:.4g}）。

## 解释边界

- 内部有效性得分不能解释为真实行为预测准确率。
- 北京市级活动统计仅用于宏观分布校准，无法验证海淀居民个体 OD。
- 在缺少问卷、轨迹和设施使用数据的条件下，应同时报告验证通过项与未验证维度。
"""
    (args.output_dir / "behavior_validation_report.md").write_text(report, encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
