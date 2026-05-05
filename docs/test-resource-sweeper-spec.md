# E2E Test Resource Sweeper — Specification

## Purpose

The e2e test suite provisions real AWS resources: CloudFormation stacks, credential providers, CloudWatch log groups, ECR images, and S3 artifacts. When a test crashes, times out, or is cancelled mid-run, its `afterAll` teardown may not execute, leaving orphaned resources behind.

Orphan cost estimates from the April 2026 audit put sustained leaks at $2.5k-$10k/week depending on which stacks escape (runtimes, memory, credential providers). Teardown is now fatal on failure (PR bundled with this spec), but belt-and-suspenders dictates a scheduled sweeper that catches anything slipping through.

This document specifies what a daily sweeper must do. The infra team owns implementation.

## Scope

The sweeper runs on a schedule (daily at 04:00 UTC recommended) in the same AWS account used by CI. It identifies and deletes resources that meet all three criteria:

1. Match a well-known e2e naming or tagging pattern.
2. Created more than N hours ago (N=4 recommended — longer than the longest e2e run).
3. Are not part of an active workflow run (check GitHub Actions API for running e2e jobs).

Dry-run mode must print what would be deleted without acting. Default to dry-run for the first two weeks.

## Resources to Sweep

### 1. CloudFormation Stacks

**Identification:** Stacks tagged with `Environment=e2e-test` (this PR adds the tag via `AGENTCORE_E2E_TEST=1` env var in `src/assets/cdk/bin/cdk.ts`). Also match by stack name prefix `AgentCore-E2e*` as a fallback for older stacks.

**Action:** `DeleteStack`. Watch for `DELETE_FAILED` and surface to the on-call rotation — some failures (S3 buckets with objects, ENIs held by Lambda) need manual intervention.

**API calls:**
- `cloudformation:DescribeStacks` (paginate, filter by tag)
- `cloudformation:DeleteStack`
- `cloudformation:DescribeStackEvents` (on DELETE_FAILED for context)

### 2. API Key Credential Providers

**Identification:** Providers named with the `E2e` prefix and `createdTime` older than N hours.

**Action:** `DeleteApiKeyCredentialProvider`. Silent failures acceptable — the CLI already logs these via `cleanupStaleCredentialProviders()`.

**API calls:**
- `bedrock-agentcore-control:ListApiKeyCredentialProviders` (paginate)
- `bedrock-agentcore-control:DeleteApiKeyCredentialProvider`

### 3. CloudWatch Log Groups

**Identification:** Log groups under `/aws/bedrock-agentcore/runtimes/E2e*` and `/aws/codebuild/AgentCore-E2e*`.

**Action:** `DeleteLogGroup` for groups older than N hours. Alternatively, set a retention policy of 3 days on all matched groups and let CloudWatch expire data. Retention is safer — deletion drops diagnostic context if someone is debugging a test failure.

**API calls:**
- `logs:DescribeLogGroups` (filter by prefix, paginate)
- `logs:PutRetentionPolicy` (preferred) or `logs:DeleteLogGroup`

### 4. ECR Repositories

**Identification:** Repositories tagged with `Environment=e2e-test` or named with the `agentcore-e2e-*` prefix.

**Action:** Delete images older than N hours. Keep the repository itself — CDK recreates images on every deploy, so repo deletion causes churn. Image cleanup is sufficient.

**API calls:**
- `ecr:DescribeRepositories` (filter by tag or name)
- `ecr:ListImages`
- `ecr:BatchDeleteImage`

### 5. S3 (CDK Bootstrap Bucket)

**Identification:** The bootstrap bucket (`cdk-*-assets-*`) is shared across all deploys in the account. Don't delete the bucket or its tagged objects — CDK uses content-hashed object keys and expects them to persist.

**Recommendation:** Apply an S3 lifecycle policy to the bootstrap bucket: transition objects to Intelligent-Tiering after 30 days, expire non-current versions after 90 days. Do this once via Terraform/CLI, not via the sweeper.

## Workflow Structure

GitHub Actions workflow (`.github/workflows/e2e-sweeper.yml`) with:

```yaml
on:
  schedule:
    - cron: '0 4 * * *'  # Daily at 04:00 UTC
  workflow_dispatch:
    inputs:
      dry-run:
        type: boolean
        default: true
```

Permissions: use the same OIDC role that e2e tests use, but with delete permissions for the resources above. Store the role ARN in `AWS_E2E_SWEEPER_ROLE_ARN`.

Steps:

1. Configure AWS credentials (OIDC).
2. Check for running e2e jobs via `gh api /repos/aws/agentcore-cli/actions/runs?status=in_progress`. If any e2e workflow is running, skip the sweep (or narrow age threshold to 24 hours).
3. Run sweep script (Node or Python) against each resource category.
4. Post a summary to a Slack channel (resource counts deleted per category, failures).
5. On any resource with repeated delete failures (>3 runs in a row), open a GitHub issue.

## Safety Rails

- **Hard age floor:** never delete anything younger than 2 hours, even if the script says to.
- **Account allow-list:** the script must fail closed if `AWS_ACCOUNT_ID` is not in the expected list (CI account only).
- **Kill switch:** check for a `SWEEPER_DISABLED` repo variable before running. On-call can flip this if the sweeper misbehaves.
- **Rate limits:** cap deletes per category at 50 per run to avoid runaway behavior.

## Implementation Order

1. Start with CloudFormation stack sweeping (highest $ impact). Run in dry-run for one week.
2. Add credential provider sweeping (already scoped by prefix, low risk).
3. Add log group retention policies (set-and-forget, no scheduled action needed).
4. Add ECR image cleanup (low $ impact; deferrable).
5. Enable live deletes after two weeks of clean dry-run output.

## References

- CDK stack tagging: `src/assets/cdk/bin/cdk.ts` (tags applied when `AGENTCORE_E2E_TEST=1`)
- Credential provider cleanup: `e2e-tests/e2e-helper.ts#cleanupStaleCredentialProviders`
- E2E teardown: `e2e-tests/e2e-helper.ts#teardownE2EProject` (throws on repeated failure as of this PR)
