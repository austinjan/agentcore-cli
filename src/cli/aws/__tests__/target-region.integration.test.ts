/**
 * Integration-style regression tests for issue #924.
 *
 * The unit tests in {@link ./target-region.test.ts} verify the env helper
 * itself; these tests verify the end-to-end invariant that motivated the bug
 * report: an AWS SDK client constructed without an explicit `region` option
 * MUST resolve to the region we applied via {@link withTargetRegion} /
 * {@link applyTargetRegionToEnv}, even when AWS_REGION / AWS_DEFAULT_REGION
 * were unset before the override.
 */
import { applyTargetRegionToEnv, currentTargetRegion, withTargetRegion } from '../target-region.js';
import { BedrockAgentCoreControlClient } from '@aws-sdk/client-bedrock-agentcore-control';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('target-region integration with AWS SDK', () => {
  let savedRegion: string | undefined;
  let savedDefaultRegion: string | undefined;
  let savedProfile: string | undefined;

  beforeEach(() => {
    savedRegion = process.env.AWS_REGION;
    savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
    savedProfile = process.env.AWS_PROFILE;
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    // Avoid the SDK reading region from a profile config file in CI
    delete process.env.AWS_PROFILE;
  });

  afterEach(() => {
    if (savedRegion !== undefined) process.env.AWS_REGION = savedRegion;
    else delete process.env.AWS_REGION;
    if (savedDefaultRegion !== undefined) process.env.AWS_DEFAULT_REGION = savedDefaultRegion;
    else delete process.env.AWS_DEFAULT_REGION;
    if (savedProfile !== undefined) process.env.AWS_PROFILE = savedProfile;
    else delete process.env.AWS_PROFILE;
  });

  it('BedrockAgentCoreControlClient with no explicit region resolves to the applied region', async () => {
    const restore = applyTargetRegionToEnv('ap-southeast-2');
    try {
      // Construct a client WITHOUT passing region — the exact pathological case
      // from issue #924.
      const client = new BedrockAgentCoreControlClient({});
      const resolvedRegion =
        typeof client.config.region === 'function' ? await client.config.region() : client.config.region;
      expect(resolvedRegion).toBe('ap-southeast-2');
    } finally {
      restore();
    }
  });

  it('withTargetRegion makes the override visible to clients constructed inside the callback', async () => {
    await withTargetRegion('eu-west-1', async () => {
      const client = new BedrockAgentCoreControlClient({});
      const resolvedRegion =
        typeof client.config.region === 'function' ? await client.config.region() : client.config.region;
      expect(resolvedRegion).toBe('eu-west-1');
      expect(currentTargetRegion()).toBe('eu-west-1');
    });
    expect(currentTargetRegion()).toBeUndefined();
  });

  it('clients constructed AFTER restore() no longer see the overridden region', async () => {
    const restore = applyTargetRegionToEnv('ap-south-1');
    restore();

    process.env.AWS_REGION = 'us-east-1';
    const client = new BedrockAgentCoreControlClient({});
    const resolvedRegion =
      typeof client.config.region === 'function' ? await client.config.region() : client.config.region;
    expect(resolvedRegion).toBe('us-east-1');
  });

  it('currentTargetRegion tracks nested apply/restore correctly', () => {
    expect(currentTargetRegion()).toBeUndefined();

    const outer = applyTargetRegionToEnv('us-west-2');
    expect(currentTargetRegion()).toBe('us-west-2');

    const inner = applyTargetRegionToEnv('eu-central-1');
    expect(currentTargetRegion()).toBe('eu-central-1');

    inner();
    expect(currentTargetRegion()).toBe('us-west-2');

    outer();
    expect(currentTargetRegion()).toBeUndefined();
  });
});
