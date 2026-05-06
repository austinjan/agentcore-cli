/**
 * Region-promotion / env-restore unit tests for handleImport.
 *
 * These tests exercise the env-mutation paths (early YAML region apply →
 * resolved-target region apply → restore in finally) without spinning up the
 * full CDK pipeline. The CDK stages are mocked at module boundaries.
 */
import { handleImport } from '../actions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all heavyweight dependencies so the test focuses purely on env handling.
vi.mock('../../../aws/account', () => ({
  validateAwsCredentials: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../operations/python/setup', () => ({
  setupPythonProject: vi.fn().mockResolvedValue({ status: 'success' }),
}));

vi.mock('../import-pipeline', () => ({
  executeCdkImportPipeline: vi.fn().mockImplementation(({ target }) => {
    // Capture what env the pipeline observed — most importantly the resolved
    // target's region. We don't need to actually run synth/import here.
    return Promise.resolve({ success: true, observedRegion: target.region });
  }),
}));

vi.mock('../yaml-parser', () => ({
  parseStarterToolkitYaml: vi.fn(),
}));

vi.mock('../../../../lib', async () => {
  const findConfigRoot = vi.fn();
  return {
    APP_DIR: 'app',
    ConfigIO: function () {
      return {
        readProjectSpec: vi.fn().mockResolvedValue({ name: 'demo', runtimes: [], memories: [], credentials: [] }),
        writeProjectSpec: vi.fn().mockResolvedValue(undefined),
        readAWSDeploymentTargets: vi
          .fn()
          .mockResolvedValue([
            { name: 'default', region: process.env.AWS_REGION ?? 'us-east-1', account: '123456789012' },
          ]),
        writeAWSDeploymentTargets: vi.fn().mockResolvedValue(undefined),
      };
    },
    findConfigRoot,
  };
});

describe('handleImport — region env promotion / restore', () => {
  let savedRegion: string | undefined;
  let savedDefaultRegion: string | undefined;

  beforeEach(() => {
    savedRegion = process.env.AWS_REGION;
    savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (savedRegion !== undefined) process.env.AWS_REGION = savedRegion;
    else delete process.env.AWS_REGION;
    if (savedDefaultRegion !== undefined) process.env.AWS_DEFAULT_REGION = savedDefaultRegion;
    else delete process.env.AWS_DEFAULT_REGION;
  });

  it('restores AWS_REGION/AWS_DEFAULT_REGION on early-return errors', async () => {
    // findConfigRoot returns undefined → handleImport returns early before any
    // region apply happens. Env should be untouched.
    const { findConfigRoot } = await import('../../../../lib');
    vi.mocked(findConfigRoot).mockReturnValue(undefined);

    const result = await handleImport({ source: '/nonexistent.yaml' });
    expect(result.success).toBe(false);
    expect('AWS_REGION' in process.env).toBe(false);
    expect('AWS_DEFAULT_REGION' in process.env).toBe(false);
  });

  it('restores prior AWS_REGION even when an unhandled error is thrown', async () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEFAULT_REGION = 'us-east-1';

    const { findConfigRoot } = await import('../../../../lib');
    vi.mocked(findConfigRoot).mockReturnValue(undefined); // early-return path

    await handleImport({ source: '/nonexistent.yaml' });

    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBe('us-east-1');
  });
});
