from core.config import PipelineConfig
from core.harness_client import HarnessClient
from orchestrations.fix_and_review.phases.setup import load_prompt


def run_plan(
    client: HarnessClient,
    config: PipelineConfig,
    session_id: str,
    issue_details: str,
    devex_content: str | None = None,
    impl_content: str | None = None,
) -> str:
    if devex_content and impl_content:
        prompt = load_prompt("planner.md",
                            issue_details=issue_details,
                            devex_content=devex_content,
                            impl_content=impl_content)
    else:
        prompt = load_prompt("planner.md", issue_details=issue_details)
    return client.invoke(session_id=session_id, message=prompt)
