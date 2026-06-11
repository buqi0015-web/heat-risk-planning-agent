from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run repeated structured-Agent simulations and quantify stochastic stability."
    )
    parser.add_argument("--seeds", default="41,42,43,44,45")
    parser.add_argument("--agents", type=int, default=50)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs/haidian/validation/behavior_seed_stability"),
    )
    return parser.parse_args()


def run_seed(seed: int, agents: int, output_dir: Path) -> pd.DataFrame:
    run_dir = output_dir / f"seed_{seed}"
    command = [
        sys.executable,
        "scripts/run_agent_standalone.py",
        "--env-dir",
        "outputs/haidian/agent_env_residential_proxy",
        "--output-dir",
        str(run_dir),
        "--n",
        str(agents),
        "--min-activities-per-agent",
        "1",
        "--max-activities-per-agent",
        "3",
        "--weather-mode",
        "era5_hourly",
        "--scenario-date",
        "2024-06-18",
        "--route-mode",
        "road",
        "--road-edges",
        "outputs/haidian/road/osm_walk_network/haidian_osm_walkable_edges_main.csv",
        "--road-environment",
        "outputs/haidian/road/osm_walk_network/haidian_osm_road_environment.csv",
        "--route-cost-mode",
        "environment",
        "--decision-mode",
        "structured",
        "--seed",
        str(seed),
    ]
    subprocess.run(command, cwd=PROJECT_ROOT, check=True)
    return pd.read_csv(run_dir / "agent_standalone_results.csv", low_memory=False)


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for seed in [int(value) for value in args.seeds.split(",") if value.strip()]:
        frame = run_seed(seed, args.agents, args.output_dir)
        rows.append(
            {
                "seed": seed,
                "agents": frame["agent_id"].nunique(),
                "activities": len(frame),
                "activities_per_agent": len(frame) / frame["agent_id"].nunique(),
                "route_success_rate": frame["route_method"].astype(str).str.startswith("road_network").mean(),
                "mean_route_distance_m": pd.to_numeric(frame["route_distance_m"], errors="coerce").mean(),
                "mean_before_exposure": pd.to_numeric(frame["before_exposure"], errors="coerce").mean(),
                "behavior_change_rate": (~frame["action"].isin(["normal", "risky_completion"])).mean(),
                "failed_activity_rate": frame["activity_status"].eq("failed").mean(),
                "risky_or_failed_rate": frame["activity_status"].isin(["failed", "risky_completion"]).mean(),
            }
        )
    runs = pd.DataFrame(rows)
    runs.to_csv(args.output_dir / "seed_run_metrics.csv", index=False, encoding="utf-8-sig")
    summary_rows = []
    for metric in runs.columns.drop("seed"):
        values = pd.to_numeric(runs[metric], errors="coerce")
        mean = float(values.mean())
        summary_rows.append(
            {
                "metric": metric,
                "mean": mean,
                "standard_deviation": float(values.std()),
                "coefficient_of_variation": float(values.std() / mean) if mean != 0 else 0.0,
                "minimum": float(values.min()),
                "maximum": float(values.max()),
            }
        )
    summary = pd.DataFrame(summary_rows)
    summary.to_csv(
        args.output_dir / "seed_stability_summary.csv", index=False, encoding="utf-8-sig"
    )
    metadata = {
        "seeds": runs["seed"].tolist(),
        "agents_per_seed": args.agents,
        "interpretation": "Coefficient of variation quantifies stochastic sampling stability; it is not an empirical accuracy metric.",
    }
    (args.output_dir / "seed_stability_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
