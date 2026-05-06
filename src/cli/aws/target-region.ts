/**
 * Make a deployment target's region authoritative for downstream AWS SDK calls.
 *
 * The AWS SDK (and CDK toolkit-lib's internal clients) resolve region from
 * AWS_REGION / AWS_DEFAULT_REGION when constructed without an explicit `region`
 * option. aws-targets.json is the user's source of truth for where resources
 * should be created, so we promote the target's region onto the environment for
 * the operation and restore any prior values afterwards.
 *
 * Without this override, a user with a non-default region in aws-targets.json
 * but no AWS_DEFAULT_REGION set would see resources created in the SDK's default
 * region — see https://github.com/aws/agentcore-cli/issues/924.
 */

type RestoreEnv = () => void;

/**
 * Tracks the currently-active target region applied via {@link applyTargetRegionToEnv}.
 * Set/cleared as part of apply/restore so deeply-nested code (e.g. tests, debug
 * assertions) can verify which target's region is "active" without re-reading
 * `process.env` (which may be transiently stomped by other code).
 */
let currentRegion: string | undefined;

/**
 * Set AWS_REGION / AWS_DEFAULT_REGION to `region` and return a restore function.
 * Callers that cannot wrap their work in a callback (e.g. CLI entrypoints that
 * span many helpers) should use this, and invoke the returned function in a
 * `finally` block.
 */
export function applyTargetRegionToEnv(region: string): RestoreEnv {
  const prevRegion = process.env.AWS_REGION;
  const prevDefaultRegion = process.env.AWS_DEFAULT_REGION;
  const prevCurrent = currentRegion;

  process.env.AWS_REGION = region;
  process.env.AWS_DEFAULT_REGION = region;
  currentRegion = region;

  return () => {
    if (prevRegion === undefined) {
      delete process.env.AWS_REGION;
    } else {
      process.env.AWS_REGION = prevRegion;
    }
    if (prevDefaultRegion === undefined) {
      delete process.env.AWS_DEFAULT_REGION;
    } else {
      process.env.AWS_DEFAULT_REGION = prevDefaultRegion;
    }
    currentRegion = prevCurrent;
  };
}

/**
 * Run `fn` with `region` applied to AWS_REGION / AWS_DEFAULT_REGION, restoring
 * the prior values on return (including when `fn` throws).
 */
export async function withTargetRegion<T>(region: string, fn: () => Promise<T>): Promise<T> {
  const restore = applyTargetRegionToEnv(region);
  try {
    return await fn();
  } finally {
    restore();
  }
}

/**
 * Returns the currently-active target region applied via {@link applyTargetRegionToEnv}
 * or {@link withTargetRegion}, or `undefined` if no override is active.
 *
 * Intended for diagnostics and tests — production code should generally read
 * `target.region` directly rather than rely on this global.
 */
export function currentTargetRegion(): string | undefined {
  return currentRegion;
}
