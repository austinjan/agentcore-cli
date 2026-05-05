import pytest

from core.parsing import Finding, ReviewResult, parse_reviewer_output


def test_parse_json_in_markdown_fences():
    raw = '''Here is my review:

```json
{
  "approved": false,
  "findings": [
    {
      "severity": "high",
      "file": "src/cli/commands/deploy/index.ts",
      "line": 42,
      "description": "Missing null check",
      "suggestion": "Add null check before accessing property"
    }
  ]
}
```

That's my review.'''
    result = parse_reviewer_output(raw)
    assert result is not None
    assert result.approved is False
    assert len(result.findings) == 1
    assert result.findings[0].severity == "high"
    assert result.findings[0].file == "src/cli/commands/deploy/index.ts"


def test_parse_bare_json():
    raw = '{"approved": true, "findings": []}'
    result = parse_reviewer_output(raw)
    assert result is not None
    assert result.approved is True
    assert result.findings == []


def test_parse_returns_none_for_garbage():
    result = parse_reviewer_output("This is just text with no JSON at all.")
    assert result is None


def test_parse_returns_none_for_invalid_schema():
    raw = '{"approved": "yes", "findings": "none"}'
    result = parse_reviewer_output(raw)
    assert result is None


def test_parse_json_with_nested_braces():
    raw = '''```json
{
  "approved": false,
  "findings": [
    {
      "severity": "medium",
      "file": "src/schema/types.ts",
      "line": 10,
      "description": "Type should use Record<string, unknown> instead of object",
      "suggestion": "Replace object with Record<string, unknown>"
    }
  ]
}
```'''
    result = parse_reviewer_output(raw)
    assert result is not None
    assert len(result.findings) == 1
    assert result.findings[0].severity == "medium"


def test_finding_model_validates_severity():
    with pytest.raises(Exception):
        Finding(
            severity="urgent",
            file="test.ts",
            line=1,
            description="bad",
            suggestion="fix",
        )
