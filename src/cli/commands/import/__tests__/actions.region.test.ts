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
  executeCdkImportPipeline: vi.fn(),
}));

vi.mock('../yaml-parser', () => ({
  parseStarterToolkitYaml: vi.fn(),
}));

// ExecLogger creates a logs directory on construction; stub it out.
vi.mock('../../../logging', () => ({
  ExecLogger: class {
    startStep() {}
    endStep() {}
    log() {}
    finalize() {}
    getRelativeLogPath() {
      return '/tmp/exec.log';
    }
  },
}));

// ConfigIO mock: hard-code targets to avoid reading from the developer's
// shell env at module-eval time. Tests that need different targets override
// `mockReadAWSDeploymentTargets` in beforeEach.
const mockReadAWSDeploymentTargets = vi.fn();
const mockWriteAWSDeploymentTargets = vi.fn();
const mockReadProjectSpec = vi.fn();
const mockWriteProjectSpec = vi.fn();

vi.mock('../../../../lib', () => ({
  APP_DIR: 'app',
  ConfigIO: function () {
    return {
      readProjectSpec: mockReadProjectSpec,
      writeProjectSpec: mockWriteProjectSpec,
      readAWSDeploymentTargets: mockReadAWSDeploymentTargets,
      writeAWSDeploymentTargets: mockWriteAWSDeploymentTargets,
    };
  },
  findConfigRoot: vi.fn(),
}));

describe('handleImport — region env promotion / restore', () => {
  let savedRegion: string | undefined;
  let savedDefaultRegion: string | undefined;

  beforeEach(() => {
    savedRegion = process.env.AWS_REGION;
    savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    vi.clearAllMocks();

    // Sane defaults for happy-path mocks (tests override as needed)
    mockReadProjectSpec.mockResolvedValue({
      name: 'demo',
      runtimes: [],
      memories: [],
      credentials: [],
    });
    mockWriteProjectSpec.mockResolvedValue(undefined);
    mockReadAWSDeploymentTargets.mockResolvedValue([{ name: 'default', region: 'us-east-1', account: '123456789012' }]);
    mockWriteAWSDeploymentTargets.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (savedRegion !== undefined) process.env.AWS_REGION = savedRegion;
    else delete process.env.AWS_REGION;
    if (savedDefaultRegion !== undefined) process.env.AWS_DEFAULT_REGION = savedDefaultRegion;
    else delete process.env.AWS_DEFAULT_REGION;
  });

  it('restores AWS_REGION/AWS_DEFAULT_REGION on early-return errors', async () => {
    // findConfigRoot returns null → handleImport returns early before any
    // region apply happens. Env should be untouched.
    const { findConfigRoot } = await import('../../../../lib');
    vi.mocked(findConfigRoot).mockReturnValue(null);

    const result = await handleImport({ source: '/nonexistent.yaml' });
    expect(result.success).toBe(false);
    expect('AWS_REGION' in process.env).toBe(false);
    expect('AWS_DEFAULT_REGION' in process.env).toBe(false);
  });

  it('restores prior AWS_REGION even when the early-return path is taken', async () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEFAULT_REGION = 'us-east-1';

    const { findConfigRoot } = await import('../../../../lib');
    vi.mocked(findConfigRoot).mockReturnValue(null); // early-return path

    await handleImport({ source: '/nonexistent.yaml' });

    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBe('us-east-1');
  });

  it('restores prior AWS_REGION after applyRegion + pipeline throw', async () => {
    // Caller had us-east-1 set; YAML pulls in resources from eu-west-2;
    // the import CDK pipeline throws midway. The outer `finally` must
    // restore env to us-east-1, not leave it on eu-west-2.
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEFAULT_REGION = 'us-east-1';

    const { findConfigRoot } = await import('../../../../lib');
    vi.mocked(findConfigRoot).mockReturnValue('/tmp/project/agentcore');

    const { parseStarterToolkitYaml } = await import('../yaml-parser');
    vi.mocked(parseStarterToolkitYaml).mockReturnValue({
      agents: [
        {
          name: 'agent1',
          entrypoint: 'main.py',
          build: 'CodeBuild',
          protocol: 'HTTP',
          networkMode: 'PUBLIC',
          enableOtel: false,
          physicalAgentId: 'AGENT_PHYS_ID',
          sourcePath: undefined,
          runtimeVersion: undefined,
          executionRoleArn: undefined,
          authorizerType: undefined,
          authorizerConfiguration: undefined,
          networkConfig: undefined,
          physicalAgentArn: undefined,
        },
      ],
      memories: [],
      credentials: [],
      awsTarget: { account: '123456789012', region: 'eu-west-2' },
    } as unknown as ReturnType<typeof parseStarterToolkitYaml>);

    // Resolved target also lives in eu-west-2 (so applyRegion runs against it)
    mockReadAWSDeploymentTargets.mockResolvedValue([{ name: 'default', region: 'eu-west-2', account: '123456789012' }]);

    // Force the CDK pipeline to throw — env must still be restored.
    let pipelineSawRegion: string | undefined;
    const { executeCdkImportPipeline } = await import('../import-pipeline');
    vi.mocked(executeCdkImportPipeline).mockImplementation(async () => {
      pipelineSawRegion = process.env.AWS_REGION;
      throw new Error('simulated CDK import failure');
    });

    const result = await handleImport({ source: '/tmp/whatever.yaml' });

    // Pipeline observed the promoted region while it was running
    expect(pipelineSawRegion).toBe('eu-west-2');
    // handleImport returned the error rather than rethrowing
    expect(result.success).toBe(false);
    expect(result.error).toContain('simulated CDK import failure');
    // And the outer finally restored the original env
    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBe('us-east-1');
  });

  it('restores env on the successful happy path', async () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEFAULT_REGION = 'us-east-1';

    const { findConfigRoot } = await import('../../../../lib');
    vi.mocked(findConfigRoot).mockReturnValue('/tmp/project/agentcore');

    const { parseStarterToolkitYaml } = await import('../yaml-parser');
    vi.mocked(parseStarterToolkitYaml).mockReturnValue({
      // No physical IDs → no CDK pipeline invocation; just validates the
      // env restore covers the success-without-import path too.
      agents: [
        {
          name: 'agent1',
          entrypoint: 'main.py',
          build: 'CodeBuild',
          protocol: 'HTTP',
          networkMode: 'PUBLIC',
          enableOtel: false,
          sourcePath: undefined,
          runtimeVersion: undefined,
          executionRoleArn: undefined,
          authorizerType: undefined,
          authorizerConfiguration: undefined,
          networkConfig: undefined,
          physicalAgentId: undefined,
          physicalAgentArn: undefined,
        },
      ],
      memories: [],
      credentials: [],
      awsTarget: { account: '123456789012', region: 'eu-west-2' },
    } as unknown as ReturnType<typeof parseStarterToolkitYaml>);

    mockReadAWSDeploymentTargets.mockResolvedValue([{ name: 'default', region: 'eu-west-2', account: '123456789012' }]);

    const result = await handleImport({ source: '/tmp/whatever.yaml' });

    expect(result.success).toBe(true);
    // Env restored even on success
    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBe('us-east-1');
  });
});
