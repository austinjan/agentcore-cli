import os
import tempfile

import pytest
import yaml

from core.config import PipelineConfig


def test_from_yaml_loads_all_fields():
    data = {
        "harness_arn": "arn:aws:bedrock-agentcore:us-west-2:123456789:harness/Test-abc",
        "region": "us-east-1",
        "data_plane_endpoint": "https://dp.example.com",
        "aws_profile": "test-profile",
        "model_id": "global.anthropic.claude-opus-4-7",
        "min_reviewers": 2,
        "max_reviewers": 4,
        "max_review_rounds": 3,
        "repos": {
            "cli": "aws/agentcore-cli",
            "cdk": "aws/agentcore-l3-cdk-constructs",
        },
    }
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(data, f)
        path = f.name

    try:
        config = PipelineConfig.from_yaml(path)
        assert config.harness_arn == data["harness_arn"]
        assert config.region == "us-east-1"
        assert config.aws_profile == "test-profile"
        assert config.min_reviewers == 2
        assert config.max_reviewers == 4
        assert config.cli_repo == "aws/agentcore-cli"
        assert config.cdk_repo == "aws/agentcore-l3-cdk-constructs"
    finally:
        os.unlink(path)


def test_from_yaml_uses_defaults_for_missing_fields():
    data = {"harness_arn": "arn:aws:bedrock-agentcore:us-west-2:123:harness/X-abc"}
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
        yaml.dump(data, f)
        path = f.name

    try:
        config = PipelineConfig.from_yaml(path)
        assert config.harness_arn == data["harness_arn"]
        assert config.region == "us-west-2"
        assert config.aws_profile == "deploy"
        assert config.min_reviewers == 3
        assert config.max_reviewers == 5
    finally:
        os.unlink(path)


def test_defaults():
    config = PipelineConfig(harness_arn="arn:aws:bedrock-agentcore:us-west-2:123:harness/X-abc")
    assert config.region == "us-west-2"
    assert config.model_id == "global.anthropic.claude-opus-4-7"
    assert config.min_reviewers == 3
    assert config.max_reviewers == 5
    assert config.max_review_rounds == 5
