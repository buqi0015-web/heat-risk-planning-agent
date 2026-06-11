from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any


def load_evidence(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def weighted_choice(weight_map: dict[str, Any], rng: random.Random) -> tuple[str, list[str]]:
    items = []
    for key, value in weight_map.items():
        if isinstance(value, dict):
            items.append((key, float(value.get("weight", 0.0)), list(value.get("source_ids", []))))
        else:
            items.append((key, float(value), []))
    total = sum(weight for _, weight, _ in items)
    if total <= 0:
        key, _, source_ids = items[0]
        return key, source_ids
    threshold = rng.random() * total
    cumulative = 0.0
    for key, weight, source_ids in items:
        cumulative += weight
        if threshold <= cumulative:
            return key, source_ids
    key, _, source_ids = items[-1]
    return key, source_ids


def source_titles(evidence: dict[str, Any], source_ids: list[str]) -> list[str]:
    sources = evidence.get("sources", {})
    return [sources[source_id]["title"] for source_id in source_ids if source_id in sources]
