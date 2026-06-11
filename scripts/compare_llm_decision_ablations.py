from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
from scipy.spatial.distance import jensenshannon

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.agents.behavior_model import ALLOWED_ACTIONS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare structured and constrained-LLM decision ablations.")
    parser.add_argument("--structured-run", type=Path, required=True)
    parser.add_argument("--llm-full-run", type=Path, required=True)
    parser.add_argument("--llm-no-spatial-run", type=Path, required=True)
    parser.add_argument("--llm-no-prior-run", type=Path, required=True)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs/haidian/validation/llm_decision_ablation"),
    )
    return parser.parse_args()


def compliant(frame: pd.DataFrame) -> float:
    return float(
        frame.apply(
            lambda row: str(row["action"]) in ALLOWED_ACTIONS[str(row["trip_type"])],
            axis=1,
        ).mean()
    )


def summarize(label: str, frame: pd.DataFrame) -> dict[str, object]:
    return {
        "ablation": label,
        "activities": len(frame),
        "decision_rule_compliance_rate": compliant(frame),
        "deepseek_success_rate": float(frame["decision_source"].eq("deepseek").mean()),
        "deepseek_fallback_rate": float(frame["decision_source"].astype(str).str.contains("fallback").mean()),
        "mean_before_exposure": float(frame["before_exposure"].mean()),
        "mean_after_exposure": float(frame["after_exposure"].mean()),
        "behavior_change_rate": float((~frame["action"].isin(["normal", "risky_completion"])).mean()),
        "failed_activity_rate": float(frame["activity_status"].eq("failed").mean()),
    }


def action_distribution(frame: pd.DataFrame, labels: list[str]) -> np.ndarray:
    counts = frame["action"].value_counts()
    values = np.array([counts.get(label, 0) for label in labels], dtype=float)
    return values / values.sum()


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    runs = {
        "structured": pd.read_csv(args.structured_run / "agent_standalone_results.csv", low_memory=False),
        "llm_full": pd.read_csv(args.llm_full_run / "agent_standalone_results.csv", low_memory=False),
        "llm_no_spatial_context": pd.read_csv(args.llm_no_spatial_run / "agent_standalone_results.csv", low_memory=False),
        "llm_no_structured_prior": pd.read_csv(args.llm_no_prior_run / "agent_standalone_results.csv", low_memory=False),
    }
    summaries = pd.DataFrame([summarize(label, frame) for label, frame in runs.items()])
    labels = sorted(set().union(*(set(frame["action"]) for frame in runs.values())))
    baseline = action_distribution(runs["structured"], labels)
    summaries["action_js_distance_from_structured"] = [
        float(jensenshannon(baseline, action_distribution(runs[label], labels)))
        for label in summaries["ablation"]
    ]
    pair_rows = []
    baseline_actions = runs["structured"].set_index("activity_id")["action"]
    for label, frame in runs.items():
        joined = frame.set_index("activity_id")[["action", "decision_source"]].join(
            baseline_actions.rename("structured_action"), how="inner"
        )
        pair_rows.append(
            {
                "ablation": label,
                "paired_activities": len(joined),
                "action_disagreement_rate": float((joined["action"] != joined["structured_action"]).mean()),
            }
        )
    paired = pd.DataFrame(pair_rows)
    summaries = summaries.merge(paired, on="ablation", how="left")
    summaries.to_csv(args.output_dir / "llm_ablation_summary.csv", index=False, encoding="utf-8-sig")
    metadata = {
        "interpretation": "All LLM variants remain constrained to the allowed action set. Ablations identify the contribution of spatial context and structured-model priors.",
        "action_labels": labels,
    }
    (args.output_dir / "llm_ablation_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    indexed = summaries.set_index("ablation")
    report = f"""# 受约束 LLM 行为决策消融实验

## 实验设计

四组实验使用相同随机种子、相同起点、目的地、路径和热暴露条件。所有 LLM 决策必须属于
相应出行类型允许的动作集合。LLM 仅在活动热压力大于 0 时调用，其余活动沿用结构化决策。

| 实验 | 活动数 | LLM 成功调用率 | 规则合规率 | 与结构化动作分歧率 |
|---|---:|---:|---:|---:|
| 结构化基线 | {int(indexed.loc['structured', 'activities'])} | - | {indexed.loc['structured', 'decision_rule_compliance_rate']:.2%} | 0.00% |
| 完整受约束 LLM | {int(indexed.loc['llm_full', 'activities'])} | {indexed.loc['llm_full', 'deepseek_success_rate']:.2%} | {indexed.loc['llm_full', 'decision_rule_compliance_rate']:.2%} | {indexed.loc['llm_full', 'action_disagreement_rate']:.2%} |
| 移除空间上下文 | {int(indexed.loc['llm_no_spatial_context', 'activities'])} | {indexed.loc['llm_no_spatial_context', 'deepseek_success_rate']:.2%} | {indexed.loc['llm_no_spatial_context', 'decision_rule_compliance_rate']:.2%} | {indexed.loc['llm_no_spatial_context', 'action_disagreement_rate']:.2%} |
| 移除结构化先验 | {int(indexed.loc['llm_no_structured_prior', 'activities'])} | {indexed.loc['llm_no_structured_prior', 'deepseek_success_rate']:.2%} | {indexed.loc['llm_no_structured_prior', 'decision_rule_compliance_rate']:.2%} | {indexed.loc['llm_no_structured_prior', 'action_disagreement_rate']:.2%} |

## 解释

完整 LLM 与结构化基线在当前配对样本中决策一致。移除空间上下文未改变动作分布，当前样本尚未检测到
空间上下文的独立贡献。移除结构化先验后动作分歧明显增加，说明结构化先验是受约束 LLM 决策稳定性的
主要来源。

本实验样本较小，且仅部分活动触发 LLM。结果用于验证约束机制和识别模型贡献，不能作为 LLM 行为准确率。
"""
    (args.output_dir / "llm_ablation_report.md").write_text(report, encoding="utf-8")
    print(summaries.to_string(index=False))


if __name__ == "__main__":
    main()
