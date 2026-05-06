import { resolveTargetForRegion, withResolvedTarget } from '../region-utils.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveAWSDeploymentTargets = vi.fn();

vi.mock('../../../../lib', () => ({
  ConfigIO: function () {
    return { resolveAWSDeploymentTargets: () => mockResolveAWSDeploymentTargets() };
  },
}));

describe('resolveTargetForRegion / withResolvedTarget (issue #924)', () => {
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
    vi.clearAllMocks();
  });

  describe('resolveTargetForRegion', () => {
    it('applies the single target region to env when targetName is omitted', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', account: '123456789012', region: 'ap-southeast-2' },
      ]);

      const { target, restore } = await resolveTargetForRegion();
      try {
        expect(target.region).toBe('ap-southeast-2');
        expect(process.env.AWS_REGION).toBe('ap-southeast-2');
        expect(process.env.AWS_DEFAULT_REGION).toBe('ap-southeast-2');
      } finally {
        restore();
      }

      expect(process.env.AWS_REGION).toBeUndefined();
      expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
    });

    it('selects target by name when multiple targets exist', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'dev', account: '111', region: 'us-east-1' },
        { name: 'prod', account: '222', region: 'eu-west-1' },
      ]);

      const { target, restore } = await resolveTargetForRegion('prod');
      try {
        expect(target.name).toBe('prod');
        expect(process.env.AWS_REGION).toBe('eu-west-1');
      } finally {
        restore();
      }
    });

    it('throws a helpful error when targetName is missing and multiple targets exist', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'dev', account: '111', region: 'us-east-1' },
        { name: 'prod', account: '222', region: 'eu-west-1' },
      ]);

      await expect(resolveTargetForRegion()).rejects.toThrow(/Multiple deployment targets/);
      // Env must NOT be mutated when resolution fails
      expect(process.env.AWS_REGION).toBeUndefined();
    });

    it('throws when the named target does not exist', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([{ name: 'dev', account: '111', region: 'us-east-1' }]);

      await expect(resolveTargetForRegion('prod')).rejects.toThrow(/Target "prod" not found/);
      expect(process.env.AWS_REGION).toBeUndefined();
    });

    it('throws when no targets are configured', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([]);

      await expect(resolveTargetForRegion()).rejects.toThrow(/No deployment targets/);
    });
  });

  describe('withResolvedTarget', () => {
    it('applies region for the duration of the callback and restores after', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', account: '123', region: 'ap-northeast-1' },
      ]);

      const seen = await withResolvedTarget(undefined, target => {
        expect(process.env.AWS_REGION).toBe('ap-northeast-1');
        return Promise.resolve(target.region);
      });

      expect(seen).toBe('ap-northeast-1');
      expect(process.env.AWS_REGION).toBeUndefined();
    });

    it('restores env even when the callback throws', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([{ name: 'default', account: '123', region: 'sa-east-1' }]);

      await expect(
        withResolvedTarget(undefined, () => {
          expect(process.env.AWS_REGION).toBe('sa-east-1');
          return Promise.reject(new Error('boom'));
        })
      ).rejects.toThrow('boom');

      expect(process.env.AWS_REGION).toBeUndefined();
    });
  });
});
