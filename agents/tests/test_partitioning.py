import pytest

from orchestrations.fix_and_review.partitioning import (
    DiffStats,
    ReviewerAssignment,
    calculate_reviewer_count,
    partition_round1_by_directory,
    partition_round2_focus_prompts,
    partition_round3_risk_areas,
)


def test_reviewer_count_small_diff():
    stats = DiffStats(changed_files=["src/cli/commands/deploy/index.ts"], total_lines=30, cross_repo=False)
    assert calculate_reviewer_count(stats, min_r=3, max_r=5) == 3


def test_reviewer_count_medium_diff():
    files = [f"src/file{i}.ts" for i in range(5)]
    stats = DiffStats(changed_files=files, total_lines=300, cross_repo=False)
    count = calculate_reviewer_count(stats, min_r=3, max_r=5)
    assert 3 <= count <= 4


def test_reviewer_count_large_diff():
    files = [f"src/file{i}.ts" for i in range(10)]
    stats = DiffStats(changed_files=files, total_lines=600, cross_repo=False)
    assert calculate_reviewer_count(stats, min_r=3, max_r=5) == 5


def test_reviewer_count_cross_repo_adds_one():
    stats = DiffStats(changed_files=["src/a.ts", "src/b.ts"], total_lines=50, cross_repo=True)
    count = calculate_reviewer_count(stats, min_r=3, max_r=5)
    assert count == 4


def test_round1_groups_by_directory():
    files = [
        "src/cli/commands/deploy/index.ts",
        "src/cli/commands/deploy/utils.ts",
        "src/cdk/constructs/l3/agent.ts",
        "test/deploy.test.ts",
    ]
    assignments = partition_round1_by_directory(files, num_reviewers=3)
    assert len(assignments) == 3
    all_files = []
    for a in assignments:
        all_files.extend(a.files)
    assert set(all_files) == set(files)


def test_round1_fewer_groups_than_reviewers():
    files = ["src/cli/commands/deploy/index.ts", "src/cli/commands/deploy/utils.ts"]
    assignments = partition_round1_by_directory(files, num_reviewers=3)
    assert len(assignments) == 3
    assert all(len(a.files) > 0 for a in assignments)


def test_round2_returns_focus_prompts():
    prompts = partition_round2_focus_prompts(num_reviewers=4)
    assert len(prompts) == 4
    assert all(isinstance(p, str) for p in prompts)
    assert len(set(prompts)) == 4


def test_round3_focuses_on_previous_findings():
    previous_findings_files = ["src/cli/commands/deploy/index.ts", "src/cdk/constructs/l3/agent.ts"]
    all_changed_files = previous_findings_files + ["test/deploy.test.ts", "src/schema/types.ts"]
    assignments = partition_round3_risk_areas(previous_findings_files, all_changed_files, num_reviewers=3)
    assert len(assignments) == 3
    risk_files_covered = set()
    for a in assignments:
        risk_files_covered.update(a.files)
    assert set(previous_findings_files).issubset(risk_files_covered)
