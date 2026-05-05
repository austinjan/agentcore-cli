from dataclasses import dataclass

import yaml


@dataclass
class PipelineConfig:
    harness_arn: str
    region: str = "us-west-2"
    data_plane_endpoint: str | None = None
    aws_profile: str = "deploy"
    model_id: str = "global.anthropic.claude-opus-4-7"
    min_reviewers: int = 3
    max_reviewers: int = 5
    max_review_rounds: int = 5
    cli_repo: str = "aws/agentcore-cli"
    cdk_repo: str = "aws/agentcore-l3-cdk-constructs"

    @classmethod
    def from_yaml(cls, path: str) -> "PipelineConfig":
        with open(path) as f:
            data = yaml.safe_load(f)

        repos = data.pop("repos", {})
        if "cli" in repos:
            data["cli_repo"] = repos["cli"]
        if "cdk" in repos:
            data["cdk_repo"] = repos["cdk"]

        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
