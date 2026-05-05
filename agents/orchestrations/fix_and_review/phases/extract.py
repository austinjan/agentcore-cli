from dataclasses import dataclass

from core.harness_client import HarnessClient
from orchestrations.fix_and_review.partitioning import DiffStats


@dataclass
class ExtractResult:
    diff_stat: str
    full_diff: str
    commit_log: str
    stats: DiffStats


def run_extract(
    client: HarnessClient,
    session_id: str,
    cli_repo: str,
    cdk_repo: str,
) -> ExtractResult:
    diff_stat_stdout, _, _ = client.run_command(session_id, "git diff main --stat")
    full_diff_stdout, _, _ = client.run_command(session_id, "git diff main")
    commit_log_stdout, _, _ = client.run_command(session_id, "git log main..HEAD --oneline")

    changed_files: list[str] = []
    for line in diff_stat_stdout.strip().split("\n"):
        line = line.strip()
        if "|" in line:
            file_path = line.split("|")[0].strip()
            if file_path:
                changed_files.append(file_path)

    total_lines = 0
    for line in full_diff_stdout.split("\n"):
        if line.startswith("+") and not line.startswith("+++"):
            total_lines += 1
        elif line.startswith("-") and not line.startswith("---"):
            total_lines += 1

    has_cli = any(f.startswith(cli_repo) or f.startswith("src/cli") for f in changed_files)
    has_cdk = any(f.startswith(cdk_repo) or f.startswith("src/cdk") for f in changed_files)
    cross_repo = has_cli and has_cdk

    stats = DiffStats(
        changed_files=changed_files,
        total_lines=total_lines,
        cross_repo=cross_repo,
    )

    return ExtractResult(
        diff_stat=diff_stat_stdout,
        full_diff=full_diff_stdout,
        commit_log=commit_log_stdout,
        stats=stats,
    )
