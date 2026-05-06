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
 * Per-process memoized read of aws-targets.json's first target region.
 *
 * Resolves to the AgentCoreRegion of `aws-targets[0]` (or `null` when no
 * project / unparseable / missing region). Cached so repeated `detectRegion()`
 * calls in the same CLI invocation share one disk read.
 *
 * Use `clearAwsTargetsRegionCache()` in tests that need to mutate the file
 * mid-run. Production code should never need to clear this cache — the file
 * does not change during a CLI invocation.
 */
let awsTargetsRegionCache: Promise<AgentCoreRegion | null> | undefined;

export function clearAwsTargetsRegionCache(): void {
  awsTargetsRegionCache = undefined;
}

async function readAwsTargetsRegion(): Promise<AgentCoreRegion | null> {
  if (awsTargetsRegionCache) return awsTargetsRegionCache;
  awsTargetsRegionCache = (async () => {
    try {
      // Lazy-import to avoid a top-level `aws/ -> lib/` dependency. There is
      // currently no `src/lib -> src/cli/aws` import path, but lazy-loading
      // here defends against a future bundler-cycle regression and matches
      // the pattern used in `config-bundle/command.tsx`.
      const { ConfigIO } = await import('../../lib');
      const configIO = new ConfigIO();
      // Use resolveAWSDeploymentTargets() (the unmutated file view) rather
      // than readAWSDeploymentTargets() so AWS_REGION cannot override the
      // file-based region — that env-overrides-file behaviour is exactly
      // what #924 fixes.
      const targets = await configIO.resolveAWSDeploymentTargets();
      const targetRegion = targets[0]?.region;
      if (targetRegion && isAgentCoreRegion(targetRegion)) {
        return targetRegion;
      }
      return null;
    } catch {
      // No project / unreadable config / unset region — caller falls through.
      return null;
    }
  })();
  return awsTargetsRegionCache;
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
 *
 * The aws-targets.json read is memoized for the lifetime of the process via
 * `awsTargetsRegionCache`, so repeated calls in the same CLI invocation
 * share a single disk read. Tests can call `clearAwsTargetsRegionCache()`
 * when they need to mutate the mocked file mid-test.
 */
export async function detectRegion(): Promise<RegionDetectionResult> {
  // Prefer aws-targets.json when present and parseable.
  const targetRegion = await readAwsTargetsRegion();
  if (targetRegion) {
    return { region: targetRegion, source: 'aws-targets' };
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
