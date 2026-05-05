import json
import re
from typing import Literal

from pydantic import BaseModel, ValidationError


class Finding(BaseModel):
    severity: Literal["critical", "high", "medium", "low"]
    file: str
    line: int
    description: str
    suggestion: str


class ReviewResult(BaseModel):
    approved: bool
    findings: list[Finding]


def parse_reviewer_output(raw_text: str) -> ReviewResult | None:
    json_str = _extract_json(raw_text)
    if json_str is None:
        return None
    return _validate(json_str)


def _extract_json(raw_text: str) -> str | None:
    match = re.search(r"```json?\s*\n(.*?)\n\s*```", raw_text, re.DOTALL)
    if match:
        return match.group(1).strip()

    start = raw_text.find("{")
    if start == -1:
        return None

    depth = 0
    for i in range(start, len(raw_text)):
        if raw_text[i] == "{":
            depth += 1
        elif raw_text[i] == "}":
            depth -= 1
            if depth == 0:
                candidate = raw_text[start : i + 1]
                if "approved" in candidate:
                    return candidate
                return None
    return None


def _validate(json_str: str) -> ReviewResult | None:
    try:
        data = json.loads(json_str)
        return ReviewResult(**data)
    except (json.JSONDecodeError, ValidationError):
        return None
