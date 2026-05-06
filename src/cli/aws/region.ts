import { type AgentCoreRegion, AgentCoreRegionSchema } from '../../schema';
import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader';

const DEFAULT_REGION: AgentCoreRegion = 'us-east-1';

export interface RegionDetectionResult {
  region: AgentCoreRegion;
  source: 'aws-targets' | 'env' | 'config' | 'default';
}

/**
 * Type guard to check if a string is a valid AgentCore region
 */
function isAgentCoreRegion(region: string): region is AgentCoreRegion {
  return AgentCoreRegionSchema.safeParse(region).success;
}

/**
 * Best-effort lookup of the region declared in aws-targets.json.
 * Returns undefined if the project is not initialized, the file is missing,
 * or the file fails to parse — callers fall back to env/config in that case.
 *
 * Uses a dynamic import to keep `region.ts` free of a top-level dependency on
 * the larger `lib` barrel (which would import a lot of unrelated code) and to
 * make this helper trivially mockable in tests via `vi.mock('../../lib')`.
 *
 * See https://github.com/aws/agentcore-cli/issues/924 — the region in
 * aws-targets.json is the user's source of truth for where resources are
 * deployed, so it should win over ambient AWS_REGION/AWS_DEFAULT_REGION.
 */
async function detectRegionFromAwsTargets(): Promise<AgentCoreRegion | undefined> {
  try {
    const { ConfigIO } = await import('../../lib');
    const configIO = new ConfigIO();
    if (!configIO.configExists('awsTargets')) {
      return undefined;
    }
    const targets = await configIO.readAWSDeploymentTargets();
    const first = targets[0];
    if (first?.region && isAgentCoreRegion(first.region)) {
      return first.region;
    }
  } catch {
    // Best-effort: never throw out of region detection.
  }
  return undefined;
}

/**
 * Detect AWS region.
 * Priority: aws-targets.json > AWS_REGION > AWS_DEFAULT_REGION > profile config > default (us-east-1)
 *
 * The aws-targets.json check was added for issue #924: previously the CLI
 * ignored the configured target region when making direct API calls unless
 * AWS_DEFAULT_REGION was also set, causing resources to be created in the
 * wrong region.
 */
export async function detectRegion(): Promise<RegionDetectionResult> {
  // 1. aws-targets.json is the user's source of truth when present.
  const targetRegion = await detectRegionFromAwsTargets();
  if (targetRegion) {
    return { region: targetRegion, source: 'aws-targets' };
  }

  // 2. Environment variables.
  const envRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (envRegion && isAgentCoreRegion(envRegion)) {
    return { region: envRegion, source: 'env' };
  }

  // 3. Shared AWS config / profile.
  try {
    const profile = process.env.AWS_PROFILE ?? 'default';
    const config = await loadSharedConfigFiles();
    const profileConfig = config.configFile?.[profile];
    if (profileConfig?.region && isAgentCoreRegion(profileConfig.region)) {
      return { region: profileConfig.region, source: 'config' };
    }
  } catch {
    // Config file not available or parse error
  }

  return { region: DEFAULT_REGION, source: 'default' };
}
