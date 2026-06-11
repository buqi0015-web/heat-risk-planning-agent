from __future__ import annotations

import math
from typing import Iterable

import numpy as np
from scipy.spatial.distance import jensenshannon
from scipy.stats import ks_2samp, wasserstein_distance


def finite_array(values: Iterable[float]) -> np.ndarray:
    array = np.asarray(list(values), dtype="float64")
    return array[np.isfinite(array)]


def distribution_metrics(
    simulated: Iterable[float],
    observed: Iterable[float],
    bins: int = 30,
) -> dict[str, float | int]:
    sim = finite_array(simulated)
    obs = finite_array(observed)
    if len(sim) == 0 or len(obs) == 0:
        return {"simulated_n": len(sim), "observed_n": len(obs)}
    lower = min(float(sim.min()), float(obs.min()))
    upper = max(float(sim.max()), float(obs.max()))
    if math.isclose(lower, upper):
        upper = lower + 1.0
    edges = np.linspace(lower, upper, bins + 1)
    sim_hist, _ = np.histogram(sim, bins=edges)
    obs_hist, _ = np.histogram(obs, bins=edges)
    sim_prob = (sim_hist + 1e-12) / (sim_hist.sum() + 1e-12 * len(sim_hist))
    obs_prob = (obs_hist + 1e-12) / (obs_hist.sum() + 1e-12 * len(obs_hist))
    ks = ks_2samp(sim, obs)
    return {
        "simulated_n": int(len(sim)),
        "observed_n": int(len(obs)),
        "simulated_mean": float(sim.mean()),
        "observed_mean": float(obs.mean()),
        "simulated_median": float(np.median(sim)),
        "observed_median": float(np.median(obs)),
        "median_relative_error": float(abs(np.median(sim) - np.median(obs)) / max(abs(np.median(obs)), 1e-12)),
        "ks_statistic": float(ks.statistic),
        "ks_pvalue": float(ks.pvalue),
        "jensen_shannon_distance": float(jensenshannon(sim_prob, obs_prob)),
        "wasserstein_distance": float(wasserstein_distance(sim, obs)),
    }
