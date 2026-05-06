import { ConfigIO } from '../../lib';
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
 * Detect AWS region for ad-hoc usage.
 *
 * Priority: aws-targets.json > AWS_REGION > AWS_DEFAULT_REGION > profile config > default (us-east-1).
 *
 * `aws-targets.json` is the user's source of truth for where resources should
 * be created (see https://github.com/aws/agentcore-cli/issues/924). When
 * available it is consulted first so callers that have not been wrapped in
 * `withTargetRegion` still observe the correct region.
 */
export async function detectRegion(): Promise<RegionDetectionResult> {
  // Prefer aws-targets.json when present and parseable.
  try {
    const configIO = new ConfigIO();
    const targets = await configIO.readAWSDeploymentTargets();
    const targetRegion = targets[0]?.region;
    if (targetRegion && isAgentCoreRegion(targetRegion)) {
      return { region: targetRegion, source: 'aws-targets' };
    }
  } catch {
    // No project / unreadable config / unset region — fall through.
  }

  // Check environment variables next
  const envRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (envRegion && isAgentCoreRegion(envRegion)) {
    return { region: envRegion, source: 'env' };
  }

  // Try to get region from AWS config files
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
