import { applyTargetRegionToEnv, withTargetRegion } from '../target-region.js';
import { BedrockAgentCoreControlClient } from '@aws-sdk/client-bedrock-agentcore-control';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Integration test that exercises the AWS SDK's region resolution chain to
 * verify withTargetRegion / applyTargetRegionToEnv actually change the region
 * the SDK will use. This is the test that would have caught issue #924 — the
 * bug was that the CLI's region helpers returned the right string but the
 * SDK clients constructed elsewhere (without an explicit region option) still
 * resolved from process.env, which the helper never mutated.
 */
describe('target-region integration with @aws-sdk', () => {
  let savedRegion: string | undefined;
  let savedDefaultRegion: string | undefined;

  beforeEach(() => {
    savedRegion = process.env.AWS_REGION;
    savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
  });

  afterEach(() => {
    if (savedRegion !== undefined) process.env.AWS_REGION = savedRegion;
    else delete process.env.AWS_REGION;
    if (savedDefaultRegion !== undefined) process.env.AWS_DEFAULT_REGION = savedDefaultRegion;
    else delete process.env.AWS_DEFAULT_REGION;
  });

  it('a BedrockAgentCoreControlClient constructed inside withTargetRegion resolves its region from the override', async () => {
    let observedRegion: string | undefined;
    await withTargetRegion('ap-southeast-2', async () => {
      const client = new BedrockAgentCoreControlClient({});
      observedRegion = await client.config.region();
    });
    expect(observedRegion).toBe('ap-southeast-2');
  });

  it('a BedrockAgentCoreControlClient constructed after applyTargetRegionToEnv resolves to the applied region', async () => {
    const restore = applyTargetRegionToEnv('eu-west-1');
    try {
      const client = new BedrockAgentCoreControlClient({});
      const region = await client.config.region();
      expect(region).toBe('eu-west-1');
    } finally {
      restore();
    }
  });

  it('region override is reverted after the callback returns (env-default flow)', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-2';
    await withTargetRegion('ap-southeast-2', async () => {
      const client = new BedrockAgentCoreControlClient({});
      expect(await client.config.region()).toBe('ap-southeast-2');
    });
    // After the override is restored, a freshly constructed client should pick
    // up the original env value.
    const client = new BedrockAgentCoreControlClient({});
    expect(await client.config.region()).toBe('us-east-2');
  });
});
