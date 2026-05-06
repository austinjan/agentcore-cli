import { ConfigIO } from '../../../lib';
import type { AwsDeploymentTarget } from '../../../schema';
import { withTargetRegion } from '../../aws';

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

/**
 * Resolve the deployment target whose region should drive AWS SDK calls for
 * a command invocation, mirroring `getRegion`'s priority:
 *
 *   cliRegion (explicit --region flag) > named target > first project target > env > us-east-1
 *
 * When `cliRegion` is provided, no project target is loaded (and the returned
 * `target` is undefined). When the project has no targets or cannot be read,
 * the returned `target` is also undefined and `region` falls back to env vars.
 *
 * Used together with `withResolvedTarget` to guarantee that downstream SDK
 * clients (and any helper that reads `process.env.AWS_REGION`) honor the
 * region from `aws-targets.json` even when no `AWS_DEFAULT_REGION` is set.
 * See https://github.com/aws/agentcore-cli/issues/924.
 */
export async function resolveTargetForRegion(
  targetName?: string,
  cliRegion?: string
): Promise<{ region: string; target?: AwsDeploymentTarget }> {
  if (cliRegion) {
    return { region: cliRegion };
  }
  try {
    const configIO = new ConfigIO();
    const targets = await configIO.resolveAWSDeploymentTargets();
    if (targets.length > 0) {
      const selected = targetName ? targets.find(t => t.name === targetName) : targets[0];
      if (selected && selected.region) {
        return { region: selected.region, target: selected };
      }
    }
  } catch {
    // Fall through to env vars
  }
  return {
    region: process.env.AWS_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  };
}

/**
 * Resolve the relevant deployment target (see `resolveTargetForRegion`) and
 * run `fn` with the target's region promoted onto AWS_REGION /
 * AWS_DEFAULT_REGION via `withTargetRegion`.
 *
 * If no project target was resolved (e.g. user passed `--region`, or there is
 * no agentcore project), `fn` runs without any env mutation — preserving the
 * historical behavior for non-project commands.
 *
 * The env is restored on both success and exception. If target resolution
 * itself throws, env is NOT mutated.
 */
export async function withResolvedTarget<T>(
  opts: { targetName?: string; cliRegion?: string },
  fn: (resolved: { region: string; target?: AwsDeploymentTarget }) => Promise<T>
): Promise<T> {
  const resolved = await resolveTargetForRegion(opts.targetName, opts.cliRegion);
  if (resolved.target?.region) {
    return withTargetRegion(resolved.target.region, () => fn(resolved));
  }
  return fn(resolved);
}
