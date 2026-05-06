import { detectRegion } from '../region.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoadConfig } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
}));

vi.mock('@smithy/shared-ini-file-loader', () => ({
  loadSharedConfigFiles: mockLoadConfig,
}));

const mockResolveAWSDeploymentTargets = vi.fn();

vi.mock('../../../lib', () => ({
  ConfigIO: function () {
    return { resolveAWSDeploymentTargets: () => mockResolveAWSDeploymentTargets() };
  },
}));

describe('detectRegion', () => {
  const savedRegion = process.env.AWS_REGION;
  const savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
  const savedProfile = process.env.AWS_PROFILE;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_PROFILE;
    // Default: no aws-targets — most existing tests assume env-based detection
    mockResolveAWSDeploymentTargets.mockRejectedValue(new Error('no project'));
  });

  afterEach(() => {
    if (savedRegion !== undefined) process.env.AWS_REGION = savedRegion;
    else delete process.env.AWS_REGION;
    if (savedDefaultRegion !== undefined) process.env.AWS_DEFAULT_REGION = savedDefaultRegion;
    else delete process.env.AWS_DEFAULT_REGION;
    if (savedProfile !== undefined) process.env.AWS_PROFILE = savedProfile;
    else delete process.env.AWS_PROFILE;
  });

  describe('aws-targets precedence', () => {
    it('returns region from aws-targets.json when present', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', region: 'ap-southeast-2', account: '111111111111' },
      ]);

      const result = await detectRegion();
      expect(result.region).toBe('ap-southeast-2');
      expect(result.source).toBe('aws-targets');
    });

    it('aws-targets.json takes precedence over AWS_REGION env var', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([
        { name: 'default', region: 'ap-southeast-2', account: '111111111111' },
      ]);
      process.env.AWS_REGION = 'us-east-1';

      const result = await detectRegion();
      expect(result.region).toBe('ap-southeast-2');
      expect(result.source).toBe('aws-targets');
    });

    it('falls back to env when aws-targets.json is empty', async () => {
      mockResolveAWSDeploymentTargets.mockResolvedValue([]);
      process.env.AWS_REGION = 'eu-west-1';

      const result = await detectRegion();
      expect(result.region).toBe('eu-west-1');
      expect(result.source).toBe('env');
    });

    it('falls back to env when ConfigIO throws (no project)', async () => {
      mockResolveAWSDeploymentTargets.mockRejectedValue(new Error('no project'));
      process.env.AWS_REGION = 'eu-west-1';

      const result = await detectRegion();
      expect(result.region).toBe('eu-west-1');
      expect(result.source).toBe('env');
    });
  });

  it('returns region from AWS_REGION env var', async () => {
    process.env.AWS_REGION = 'us-west-2';

    const result = await detectRegion();
    expect(result.region).toBe('us-west-2');
    expect(result.source).toBe('env');
  });

  it('returns region from AWS_DEFAULT_REGION env var', async () => {
    process.env.AWS_DEFAULT_REGION = 'eu-west-1';

    const result = await detectRegion();
    expect(result.region).toBe('eu-west-1');
    expect(result.source).toBe('env');
  });

  it('AWS_REGION takes precedence over AWS_DEFAULT_REGION', async () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEFAULT_REGION = 'eu-west-1';

    const result = await detectRegion();
    expect(result.region).toBe('us-east-1');
    expect(result.source).toBe('env');
  });

  it('ignores invalid regions from env vars', async () => {
    process.env.AWS_REGION = 'not-a-real-region';

    mockLoadConfig.mockResolvedValue({
      configFile: {},
      credentialsFile: {},
    });

    const result = await detectRegion();
    expect(result.source).not.toBe('env');
  });

  it('reads region from AWS config file (default profile)', async () => {
    mockLoadConfig.mockResolvedValue({
      configFile: {
        default: { region: 'ap-southeast-1' },
      },
      credentialsFile: {},
    });

    const result = await detectRegion();
    expect(result.region).toBe('ap-southeast-1');
    expect(result.source).toBe('config');
  });

  it('falls back to default profile when AWS_PROFILE not set', async () => {
    // AWS_PROFILE not set, so function uses 'default' profile
    mockLoadConfig.mockResolvedValue({
      configFile: {
        default: { region: 'eu-central-1' },
        other: { region: 'us-west-1' },
      },
      credentialsFile: {},
    });

    const result = await detectRegion();
    expect(result.region).toBe('eu-central-1');
    expect(result.source).toBe('config');
  });

  it('returns default us-east-1 when no region found', async () => {
    mockLoadConfig.mockResolvedValue({
      configFile: {},
      credentialsFile: {},
    });

    const result = await detectRegion();
    expect(result.region).toBe('us-east-1');
    expect(result.source).toBe('default');
  });

  it('returns default when config loading throws', async () => {
    mockLoadConfig.mockRejectedValue(new Error('no config file'));

    const result = await detectRegion();
    expect(result.region).toBe('us-east-1');
    expect(result.source).toBe('default');
  });
});
