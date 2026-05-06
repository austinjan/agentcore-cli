import type { AgentCoreRegion } from '../../schema';
import { detectAccount } from './account';
import { detectRegion } from './region';

/**
 * Detected AWS context from environment/config
 */
export interface AwsContext {
  accountId: string | null;
  region: AgentCoreRegion;
  regionSource: 'aws-targets' | 'env' | 'config' | 'default';
}

/**
 * Detect AWS context (account ID and region) from environment
 */
export async function detectAwsContext(): Promise<AwsContext> {
  const [accountId, { region, source }] = await Promise.all([detectAccount(), detectRegion()]);

  return {
    accountId,
    region,
    regionSource: source,
  };
}
