import { getRegion, resolveTargetForRegion, withResolvedTarget } from '../region-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Per-method `vi.fn()` so adding a new ConfigIO call from region-utils.ts
// fails loudly with a clear "X is not a function" rather than a silent
// undefined return through a plain partial mock.
const mockResolveAWSDeploymentTargets = vi.fn();
const mockReadAWSDeploymentTargets = vi.fn(() => {
  throw new Error('region-utils should call resolveAWSDeploymentTargets, not readAWSDeploymentTargets');
});

vi.mock('../../../../lib', () => ({
  ConfigIO: function () {
    return {
      resolveAWSDeploymentTargets: mockResolveAWSDeploymentTargets,
      readAWSDeploymentTargets: mockReadAWSDeploymentTargets,
    };
  },
}));

describe('region-utils — resolveTargetForRegion / withResolvedTarget', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_REGION;
    vi.clearAllMocks();
    // Re-install the readAWSDeploymentTargets guard after clearAllMocks().
    mockReadAWSDeploymentTargets.mockImplementation(() => {
      throw new Error('region-utils should call resolveAWSDeploymentTargets, not readAWSDeploymentTargets');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getRegion', () => {
    it('returns the explicit cliRegion when provided', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', region: 'us-east-1', account: '111111111111' },
      ]);
      const region = await getRegion('eu-west-1');
      expect(region).toBe('eu-west-1');
    });

    it('resolves the first aws-targets entry when no flag provided', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', region: 'ap-southeast-2', account: '111111111111' },
      ]);
      const region = await getRegion();
      expect(region).toBe('ap-southeast-2');
    });

    it('selects a named target when targetName is provided', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'dev', region: 'us-east-1', account: '111111111111' },
        { name: 'prod', region: 'eu-central-1', account: '222222222222' },
      ]);
      const region = await getRegion(undefined, 'prod');
      expect(region).toBe('eu-central-1');
    });

    it('falls back to env when no targets exist', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([]);
      process.env.AWS_DEFAULT_REGION = 'sa-east-1';
      const region = await getRegion();
      expect(region).toBe('sa-east-1');
    });

    it('falls back to us-east-1 when nothing is set', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([]);
      const region = await getRegion();
      expect(region).toBe('us-east-1');
    });
  });

  describe('resolveTargetForRegion', () => {
    it('returns the named target with full info when found', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'dev', region: 'us-east-1', account: '111111111111' },
        { name: 'prod', region: 'eu-central-1', account: '222222222222' },
      ]);
      const result = await resolveTargetForRegion(undefined, 'prod');
      expect(result.region).toBe('eu-central-1');
      expect(result.target).toEqual({ name: 'prod', region: 'eu-central-1', account: '222222222222' });
    });

    it('returns the first target when no targetName is given', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', region: 'ap-south-1', account: '111111111111' },
      ]);
      const result = await resolveTargetForRegion();
      expect(result.region).toBe('ap-south-1');
      expect(result.target?.name).toBe('default');
    });

    it('returns only the cliRegion (no target) when explicit', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', region: 'us-east-1', account: '111111111111' },
      ]);
      const result = await resolveTargetForRegion('eu-west-1');
      expect(result.region).toBe('eu-west-1');
      expect(result.target).toBeUndefined();
    });

    it('falls back to env-based region when no targets', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([]);
      process.env.AWS_REGION = 'me-south-1';
      const result = await resolveTargetForRegion();
      expect(result.region).toBe('me-south-1');
      expect(result.target).toBeUndefined();
    });
  });

  describe('withResolvedTarget', () => {
    // These tests rely on the real `withTargetRegion` implementation from
    // ../../aws/target-region.ts to verify end-to-end env-mutation behaviour.
    // If `withTargetRegion` is ever refactored (e.g. to use AsyncLocalStorage),
    // these assertions should move into target-region.test.ts and this suite
    // should mock `../../aws` to spy on invocation arguments only.
    it('applies the resolved region to env for the duration of fn', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', region: 'ap-northeast-1', account: '111111111111' },
      ]);

      let envInside: string | undefined;
      const result = await withResolvedTarget({}, resolved => {
        envInside = process.env.AWS_REGION;
        expect(resolved.region).toBe('ap-northeast-1');
        return Promise.resolve(42);
      });

      expect(envInside).toBe('ap-northeast-1');
      expect(result).toBe(42);
      // Use `in` to assert the env var was deleted (not just set to "undefined"
      // string), pinning the contract that withTargetRegion deletes when the
      // original was unset.
      expect('AWS_REGION' in process.env).toBe(false);
    });

    it('restores env even when fn throws', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', region: 'eu-west-3', account: '111111111111' },
      ]);
      process.env.AWS_REGION = 'us-east-1';

      await expect(
        withResolvedTarget({}, () => {
          expect(process.env.AWS_REGION).toBe('eu-west-3');
          return Promise.reject(new Error('boom'));
        })
      ).rejects.toThrow('boom');

      expect(process.env.AWS_REGION).toBe('us-east-1');
    });
  });
});
