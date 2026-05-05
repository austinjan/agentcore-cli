from dataclasses import dataclass

from core.parsing import Finding, ReviewResult


@dataclass
class AggregateResult:
    all_approved: bool
    unique_findings: list[Finding]
    parse_failures: int
    total_reviewers: int


def run_aggregate(
    review_results: list[tuple[ReviewResult | None, str]],
) -> AggregateResult:
    all_approved = True
    findings: list[Finding] = []
    parse_failures = 0

    for parsed, raw in review_results:
        if parsed is None:
            all_approved = False
            parse_failures += 1
            findings.append(
                Finding(
                    severity="high",
                    file="",
                    line=0,
                    description="Reviewer output failed to parse after retries",
                    suggestion="Manual review needed",
                )
            )
        else:
            if not parsed.approved:
                all_approved = False
            findings.extend(parsed.findings)

    unique = _deduplicate(findings)

    return AggregateResult(
        all_approved=all_approved,
        unique_findings=unique,
        parse_failures=parse_failures,
        total_reviewers=len(review_results),
    )


def _deduplicate(findings: list[Finding]) -> list[Finding]:
    seen: set[str] = set()
    unique: list[Finding] = []
    for f in findings:
        key = f"{f.file}:{f.line}:{f.description[:50]}"
        if key not in seen:
            seen.add(key)
            unique.append(f)
    return unique
