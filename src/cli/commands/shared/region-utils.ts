import { ConfigIO } from '../../../lib';
import type { AwsDeploymentTarget } from '../../../schema';
import { withTargetRegion } from '../../aws';

/**
 * Resolve the AWS region to use for an ad-hoc command.
 *
 * Precedence:
 *   1. Explicit `--region` CLI flag
 *   2. `aws-targets.json` (selected target, or first if no name given)
 *   3. AWS_DEFAULT_REGION / AWS_REGION env vars
 *   4. Hard-coded fallback `us-east-1`
 *
 * See https://github.com/aws/agentcore-cli/issues/924.
 */
export async function getRegion(cliRegion?: string, targetName?: string): Promise<string> {
  if (cliRegion) return cliRegion;
  try {
    const configIO = new ConfigIO();
    const targets = await configIO.resolveAWSDeploymentTargets();
    if (targets.length > 0) {
      const selected = targetName ? targets.find(t => t.name === targetName) : targets[0];
      if (selected) return selected.region;
    }
  } catch {
    // Fall through to env vars
  }
  return process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
}

export interface ResolvedTarget {
  /** Resolved deployment target, when one is available in aws-targets.json. */
  target?: AwsDeploymentTarget;
  /** Region to use for AWS SDK calls. Always defined. */
  region: string;
}

/**
 * Resolve a deployment target by name (or first available) from aws-targets.json,
 * falling back to env / default for region when no targets are configured.
 *
 * Unlike `getRegion`, this also returns the full target so callers that need
 * `account` (or any other field) can avoid a second `ConfigIO` round-trip.
 */
export async function resolveTargetForRegion(cliRegion?: string, targetName?: string): Promise<ResolvedTarget> {
  if (cliRegion) {
    return { region: cliRegion };
  }
  try {
    const configIO = new ConfigIO();
    const targets = await configIO.resolveAWSDeploymentTargets();
    if (targets.length > 0) {
      const selected = targetName ? targets.find(t => t.name === targetName) : targets[0];
      if (selected) return { target: selected, region: selected.region };
    }
  } catch {
    // Fall through to env vars
  }
  return {
    region: process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  };
}

/**
 * Run `fn` with the resolved target's region applied to the environment.
 *
 * This is the recommended entrypoint for ad-hoc commands (abtest, config-bundle,
 * recommendations, etc.) that need to honour aws-targets.json without forcing
 * each caller to wire `applyTargetRegionToEnv` by hand.
 */
export async function withResolvedTarget<T>(
  options: { cliRegion?: string; targetName?: string },
  fn: (resolved: ResolvedTarget) => Promise<T>
): Promise<T> {
  const resolved = await resolveTargetForRegion(options.cliRegion, options.targetName);
  return withTargetRegion(resolved.region, () => fn(resolved));
}
