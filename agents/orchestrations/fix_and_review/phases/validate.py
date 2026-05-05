import re
from dataclasses import dataclass

from core.harness_client import HarnessClient


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str]


def run_validate(
    client: HarnessClient,
    session_id: str,
    plan_text: str,
) -> ValidationResult:
    file_refs = re.findall(r"(?:src|test|tests)/[\w/.-]+\.(?:ts|tsx|js|json)", plan_text)
    file_refs = list(set(file_refs))

    errors: list[str] = []
    for file_ref in file_refs:
        for repo_dir in ["agentcore-cli", "agentcore-l3-cdk-constructs"]:
            stdout, stderr, exit_code = client.run_command(
                session_id, f"test -f {repo_dir}/{file_ref} && echo EXISTS || echo MISSING"
            )
            if "EXISTS" in stdout:
                break
        else:
            if "create" not in plan_text.lower() or file_ref not in plan_text:
                errors.append(f"File not found in either repo: {file_ref}")

    return ValidationResult(valid=len(errors) == 0, errors=errors)
