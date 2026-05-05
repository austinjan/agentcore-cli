"""Bug Fixer Agent — resolves GitHub issues labeled 'bug'.

Usage:
    uv run bug_fixer/main.py --issue https://github.com/aws/agentcore-cli/issues/123
    uv run bug_fixer/main.py --issue https://github.com/aws/agentcore-cli/issues/123 --config config.yaml
"""

import argparse
import sys
from pathlib import Path

from orchestrations.fix_and_review.orchestrator import run_pipeline

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


def main():
    parser = argparse.ArgumentParser(description="Bug Fixer Agent")
    parser.add_argument("--issue", required=True, help="GitHub issue URL")
    parser.add_argument("--config", default="config.yaml", help="Config YAML path")
    parser.add_argument("--aws-profile", help="Override AWS profile")
    parser.add_argument("--harness-arn", help="Override harness ARN")
    args = parser.parse_args()

    overrides = {}
    if args.aws_profile:
        overrides["aws_profile"] = args.aws_profile
    if args.harness_arn:
        overrides["harness_arn"] = args.harness_arn

    return run_pipeline(
        issue_url=args.issue,
        config_path=args.config,
        prompts_dir=PROMPTS_DIR,
        **overrides,
    )


if __name__ == "__main__":
    sys.exit(main())
