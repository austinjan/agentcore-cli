import { resolveTargetForRegion, withResolvedTarget } from '../region-utils.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveAWSDeploymentTargets = vi.fn();

vi.mock('../../../../lib', () => ({
  ConfigIO: function () {
    return { resolveAWSDeploymentTargets: () => mockResolveAWSDeploymentTargets() };
  },
}));

describe('resolveTargetForRegion', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_REGION;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('returns cliRegion immediately without consulting ConfigIO', async () => {
    mockResolveAWSDeploymentTargets.mockResolvedValue([{ name: 'default', region: 'ap-southeast-1' }]);

    const result = await resolveTargetForRegion(undefined, 'us-west-2');

    expect(result).toEqual({ region: 'us-west-2' });
    expect(mockResolveAWSDeploymentTargets).not.toHaveBeenCalled();
  });

  it('returns the first project target when no targetName is given', async () => {
    const t1 = { name: 'default', region: 'ap-northeast-1', account: '111' };
    const t2 = { name: 'prod', region: 'us-east-1', account: '222' };
    mockResolveAWSDeploymentTargets.mockResolvedValue([t1, t2]);

    const result = await resolveTargetForRegion();

    expect(result.region).toBe('ap-northeast-1');
    expect(result.target).toEqual(t1);
  });

  it('selects the named target when targetName is given', async () => {
    const t1 = { name: 'default', region: 'ap-northeast-1', account: '111' };
    const t2 = { name: 'prod', region: 'us-east-1', account: '222' };
    mockResolveAWSDeploymentTargets.mockResolvedValue([t1, t2]);

    const result = await resolveTargetForRegion('prod');

    expect(result.region).toBe('us-east-1');
    expect(result.target).toEqual(t2);
  });

  it('falls back to env when targetName does not match', async () => {
    mockResolveAWSDeploymentTargets.mockResolvedValue([{ name: 'default', region: 'ap-northeast-1' }]);
    process.env.AWS_DEFAULT_REGION = 'eu-west-1';

    const result = await resolveTargetForRegion('does-not-exist');

    expect(result.region).toBe('eu-west-1');
    expect(result.target).toBeUndefined();
  });

  it('falls back to env when ConfigIO throws', async () => {
    mockResolveAWSDeploymentTargets.mockRejectedValue(new Error('no project'));
    process.env.AWS_DEFAULT_REGION = 'eu-west-2';

    const result = await resolveTargetForRegion();

    expect(result.region).toBe('eu-west-2');
    expect(result.target).toBeUndefined();
  });

  it('returns us-east-1 when nothing is configured', async () => {
    mockResolveAWSDeploymentTargets.mockResolvedValue([]);

    const result = await resolveTargetForRegion();

    expect(result.region).toBe('us-east-1');
    expect(result.target).toBeUndefined();
  });
});

describe('withResolvedTarget', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_REGION;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('applies the resolved target region to env for the duration of fn', async () => {
    mockResolveAWSDeploymentTargets.mockResolvedValue([{ name: 'default', region: 'ap-southeast-2' }]);

    let observed: string | undefined;
    await withResolvedTarget({}, async resolved => {
      observed = process.env.AWS_REGION;
      expect(resolved.region).toBe('ap-southeast-2');
      expect(resolved.target?.name).toBe('default');
    });

    expect(observed).toBe('ap-southeast-2');
    expect(process.env.AWS_REGION).toBeUndefined();
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
  });

  it('does NOT mutate env when no target resolves (cliRegion case)', async () => {
    let envDuring: { region: string | undefined; defaultRegion: string | undefined } | undefined;
    await withResolvedTarget({ cliRegion: 'us-west-2' }, async () => {
      envDuring = {
        region: process.env.AWS_REGION,
        defaultRegion: process.env.AWS_DEFAULT_REGION,
      };
    });

    expect(envDuring?.region).toBeUndefined();
    expect(envDuring?.defaultRegion).toBeUndefined();
    expect(mockResolveAWSDeploymentTargets).not.toHaveBeenCalled();
  });

  it('does NOT mutate env when no project target is found (env-fallback case)', async () => {
    mockResolveAWSDeploymentTargets.mockResolvedValue([]);
    process.env.AWS_DEFAULT_REGION = 'eu-central-1';

    let envDuring: string | undefined;
    await withResolvedTarget({}, async resolved => {
      envDuring = process.env.AWS_REGION;
      expect(resolved.region).toBe('eu-central-1');
      expect(resolved.target).toBeUndefined();
    });

    // AWS_REGION should NOT have been set by us — only AWS_DEFAULT_REGION was
    // pre-existing and is left alone.
    expect(envDuring).toBeUndefined();
    expect(process.env.AWS_DEFAULT_REGION).toBe('eu-central-1');
  });

  it('restores env when fn throws', async () => {
    mockResolveAWSDeploymentTargets.mockResolvedValue([{ name: 'default', region: 'ap-southeast-2' }]);

    await expect(
      withResolvedTarget({}, async () => {
        expect(process.env.AWS_REGION).toBe('ap-southeast-2');
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(process.env.AWS_REGION).toBeUndefined();
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
  });

  it('does NOT mutate env when target resolution itself throws', async () => {
    // ConfigIO throws → resolveTargetForRegion swallows and falls back to env.
    // Since no target object is returned, withResolvedTarget should NOT mutate env.
    mockResolveAWSDeploymentTargets.mockRejectedValue(new Error('fs error'));
    process.env.AWS_DEFAULT_REGION = 'eu-west-1';

    let envDuring: string | undefined;
    await withResolvedTarget({}, async () => {
      envDuring = process.env.AWS_REGION;
    });

    expect(envDuring).toBeUndefined();
    expect(process.env.AWS_DEFAULT_REGION).toBe('eu-west-1');
  });
});
