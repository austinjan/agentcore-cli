"""Feature Builder Agent — builds features from devex + implementation docs.

Usage:
    uv run python -m feature_builder.main --devex docs/devex.md --impl docs/impl.md
    uv run python -m feature_builder.main --devex docs/devex.md --impl docs/impl.md --config config.yaml
"""

import argparse
import sys
from pathlib import Path

from orchestrations.fix_and_review.orchestrator import run_pipeline

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


def main():
    parser = argparse.ArgumentParser(description="Feature Builder Agent")
    parser.add_argument("--devex", required=True, help="Path to devex doc (markdown)")
    parser.add_argument("--impl", required=True, help="Path to implementation plan (markdown)")
    parser.add_argument("--name", help="Feature name (used for branch naming)")
    parser.add_argument("--config", default="config.yaml", help="Config YAML path")
    parser.add_argument("--aws-profile", help="Override AWS profile")
    parser.add_argument("--harness-arn", help="Override harness ARN")
    args = parser.parse_args()

    devex_path = Path(args.devex)
    impl_path = Path(args.impl)

    if not devex_path.exists():
        print(f"Error: devex doc not found: {devex_path}", file=sys.stderr)
        return 1
    if not impl_path.exists():
        print(f"Error: impl doc not found: {impl_path}", file=sys.stderr)
        return 1

    devex_content = devex_path.read_text()
    impl_content = impl_path.read_text()

    feature_name = args.name or devex_path.stem.replace(" ", "-").lower()

    # Construct a synthetic "issue" that the orchestrator can consume
    # The orchestrator expects an issue_url — we pass a placeholder and override the setup phase
    issue_url = f"feature/{feature_name}"

    overrides = {}
    if args.aws_profile:
        overrides["aws_profile"] = args.aws_profile
    if args.harness_arn:
        overrides["harness_arn"] = args.harness_arn

    return run_pipeline(
        issue_url=issue_url,
        config_path=args.config,
        prompts_dir=PROMPTS_DIR,
        devex_content=devex_content,
        impl_content=impl_content,
        feature_name=feature_name,
        **overrides,
    )


if __name__ == "__main__":
    sys.exit(main())
