import { ConfigIO } from '../../../lib';
import type { AwsDeploymentTarget } from '../../../schema';
import { applyTargetRegionToEnv } from '../../aws';

export async function getRegion(cliRegion?: string): Promise<string> {
  if (cliRegion) return cliRegion;
  try {
    const configIO = new ConfigIO();
    const targets = await configIO.resolveAWSDeploymentTargets();
    if (targets.length > 0) return targets[0]!.region;
  } catch {
    // Fall through to env vars
  }
  return process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
}

export interface ResolvedTarget {
  /** The deployment target whose region should be authoritative. */
  target: AwsDeploymentTarget;
  /** Restore function — call in a `finally` to undo the env override. */
  restore: () => void;
}

/**
 * Resolve a deployment target by name (or pick the single target if `name` is
 * omitted) and apply its region to `AWS_REGION` / `AWS_DEFAULT_REGION` so any
 * downstream AWS SDK client constructed without an explicit `region` option
 * still targets the correct region.
 *
 * Callers MUST invoke the returned `restore` function in a `finally` block to
 * avoid leaking the env override into subsequent code (especially in tests and
 * the long-lived TUI process). For callback-style usage, prefer
 * {@link withResolvedTarget}.
 *
 * See https://github.com/aws/agentcore-cli/issues/924.
 */
export async function resolveTargetForRegion(
  targetName?: string,
  configIO: ConfigIO = new ConfigIO()
): Promise<ResolvedTarget> {
  const targets = await configIO.resolveAWSDeploymentTargets();
  if (targets.length === 0) {
    throw new Error('No deployment targets found in aws-targets.json');
  }

  let target: AwsDeploymentTarget | undefined;
  if (targetName) {
    target = targets.find(t => t.name === targetName);
    if (!target) {
      const names = targets.map(t => `  - ${t.name} (${t.region}, ${t.account})`).join('\n');
      throw new Error(`Target "${targetName}" not found. Available targets:\n${names}`);
    }
  } else if (targets.length === 1) {
    target = targets[0]!;
  } else {
    const names = targets.map(t => `  - ${t.name} (${t.region}, ${t.account})`).join('\n');
    throw new Error(`Multiple deployment targets found. Specify one with --target:\n${names}`);
  }

  const restore = applyTargetRegionToEnv(target.region);
  return { target, restore };
}

/**
 * Callback variant of {@link resolveTargetForRegion}: resolves the target,
 * applies its region to env for the duration of `fn`, and restores the prior
 * env values on return (including when `fn` throws).
 */
export async function withResolvedTarget<T>(
  targetName: string | undefined,
  fn: (target: AwsDeploymentTarget) => Promise<T>,
  configIO?: ConfigIO
): Promise<T> {
  const { target, restore } = await resolveTargetForRegion(targetName, configIO);
  try {
    return await fn(target);
  } finally {
    restore();
  }
}
