import { detectRegion } from '../../aws/region';

/**
 * Resolve the region to use for a CLI command, honouring an explicit
 * --region flag first and otherwise delegating to the shared detection
 * chain (aws-targets.json > env > shared config > default).
 *
 * Kept as a thin wrapper for ergonomics in command actions; the source of
 * truth for fallback ordering lives in `detectRegion()`. See issue #924.
 */
export async function getRegion(cliRegion?: string): Promise<string> {
  if (cliRegion) return cliRegion;
  const { region } = await detectRegion();
  return region;
}
