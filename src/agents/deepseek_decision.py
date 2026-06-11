from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").strip()
        cleaned = cleaned.removesuffix("```").strip()
    return json.loads(cleaned)


def choose_action_with_deepseek(
    context: dict[str, Any],
    allowed_actions: list[str],
    structured_action: str,
    structured_reason: str,
    model: str,
    timeout_seconds: int,
    include_structured_prior: bool = True,
) -> tuple[str, str, str]:
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is missing. Set it in the environment or local .env file.")

    prompt = {
        "task": "Select one heat-response action for an urban resident activity.",
        "requirements": [
            "Select exactly one action from allowed_actions.",
            "Respect the activity purpose, time rigidity, heat exposure and cooling-facility conditions.",
            "Return concise Chinese reasoning.",
            "Do not invent locations, facilities or numeric values.",
        ],
        "allowed_actions": allowed_actions,
        "context": context,
        "output_schema": {
            "selected_action": "one item from allowed_actions",
            "reason": "concise Chinese explanation",
        },
    }
    if include_structured_prior:
        prompt["structured_model_suggestion"] = structured_action
        prompt["structured_model_reason"] = structured_reason
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a constrained urban heat-risk behavior decision agent. Output JSON only.",
            },
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        DEEPSEEK_API_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DeepSeek API HTTP {exc.code}: {detail}") from exc
    content = result["choices"][0]["message"]["content"]
    decision = _extract_json(content)
    action = str(decision.get("selected_action", "")).strip()
    if action not in allowed_actions:
        raise ValueError(f"DeepSeek selected disallowed action: {action}")
    reason = str(decision.get("reason", "")).strip() or structured_reason
    return action, reason, "deepseek"
