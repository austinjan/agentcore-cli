/**
 * SDK-level integration test for the target-region helpers.
 *
 * The earlier unit tests assert that AWS_REGION / AWS_DEFAULT_REGION are set
 * in the environment, but they don't prove that an AWS SDK client constructed
 * inside `withTargetRegion()` actually resolves the wrapped region.
 *
 * Smithy clients resolve the region via a region-provider chain that reads
 * env vars at construction time. This test guards against regressions in:
 *   - the wrapper applying the region too late (after client construction),
 *   - the SDK changing its default chain, or
 *   - a future refactor accidentally caching region across calls.
 */
import { applyTargetRegionToEnv, withTargetRegion } from '../target-region.js';
import { STSClient } from '@aws-sdk/client-sts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('target-region (integration with AWS SDK)', () => {
  let savedRegion: string | undefined;
  let savedDefaultRegion: string | undefined;
  let savedProfile: string | undefined;

  beforeEach(() => {
    savedRegion = process.env.AWS_REGION;
    savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
    // Also clear AWS_PROFILE so a developer with a profile-pinned region
    // doesn't pollute these tests via the SDK's INI fallback. Mirrors the
    // pattern used in src/cli/aws/__tests__/region.test.ts.
    savedProfile = process.env.AWS_PROFILE;
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
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

  it('STSClient constructed inside withTargetRegion picks up the wrapped region', async () => {
    let resolvedRegion: string | undefined;

    await withTargetRegion('eu-west-2', async () => {
      const client = new STSClient({});
      // SDK v3 stores the region as an async provider on the resolved config.
      const regionProvider = client.config.region;
      resolvedRegion = typeof regionProvider === 'function' ? await regionProvider() : regionProvider;
    });

    expect(resolvedRegion).toBe('eu-west-2');
  });

  it('applyTargetRegionToEnv affects clients constructed while it is active', async () => {
    const restore = applyTargetRegionToEnv('ap-northeast-1');
    try {
      const client = new STSClient({});
      const regionProvider = client.config.region;
      const resolved = typeof regionProvider === 'function' ? await regionProvider() : regionProvider;
      expect(resolved).toBe('ap-northeast-1');
    } finally {
      restore();
    }
  });
});
