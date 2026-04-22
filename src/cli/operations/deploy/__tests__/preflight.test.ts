import { formatError, validateHarnessCredentialReferences, validateProject } from '../preflight.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  mockReadProjectSpec,
  mockReadAWSDeploymentTargets,
  mockReadDeployedState,
  mockConfigExists,
  mockReadHarnessSpec,
} = vi.hoisted(() => ({
  mockReadProjectSpec: vi.fn(),
  mockReadAWSDeploymentTargets: vi.fn(),
  mockReadDeployedState: vi.fn(),
  mockConfigExists: vi.fn(),
  mockReadHarnessSpec: vi.fn(),
}));

const { mockValidate } = vi.hoisted(() => ({
  mockValidate: vi.fn(),
}));

const { mockValidateAwsCredentials } = vi.hoisted(() => ({
  mockValidateAwsCredentials: vi.fn(),
}));

const { mockRequireConfigRoot } = vi.hoisted(() => ({
  mockRequireConfigRoot: vi.fn(),
}));

vi.mock('../../../../lib/index.js', () => ({
  ConfigIO: class {
    constructor(_options?: { baseDir?: string }) {
      // mock constructor
    }
    readProjectSpec = mockReadProjectSpec;
    readAWSDeploymentTargets = mockReadAWSDeploymentTargets;
    resolveAWSDeploymentTargets = mockReadAWSDeploymentTargets;
    readDeployedState = mockReadDeployedState;
    readHarnessSpec = mockReadHarnessSpec;
    configExists = mockConfigExists;
  },
  requireConfigRoot: mockRequireConfigRoot,
}));

vi.mock('../../../cdk/local-cdk-project.js', () => ({
  LocalCdkProject: class {
    validate = mockValidate;
  },
}));

vi.mock('../../../aws/account.js', () => ({
  validateAwsCredentials: mockValidateAwsCredentials,
}));

describe('validateProject', () => {
  afterEach(() => vi.clearAllMocks());

  it('allows deploy when gateways exist but no agents', async () => {
    mockRequireConfigRoot.mockReturnValue('/project/agentcore');
    mockValidate.mockReturnValue(undefined);
    mockReadProjectSpec.mockResolvedValue({
      name: 'test-project',
      runtimes: [],
      agentCoreGateways: [{ name: 'test-gateway' }],
    });
    mockReadAWSDeploymentTargets.mockResolvedValue([]);
    mockValidateAwsCredentials.mockResolvedValue(undefined);

    const result = await validateProject();

    expect(result.projectSpec.name).toBe('test-project');
    expect(result.isTeardownDeploy).toBe(false);
  });

  it('blocks deploy when no agents and no gateways', async () => {
    mockRequireConfigRoot.mockReturnValue('/project/agentcore');
    mockValidate.mockReturnValue(undefined);
    mockReadProjectSpec.mockResolvedValue({
      name: 'test-project',
      runtimes: [],
      agentCoreGateways: [],
    });
    mockReadAWSDeploymentTargets.mockResolvedValue([]);
    mockReadDeployedState.mockRejectedValue(new Error('No deployed state'));

    await expect(validateProject()).rejects.toThrow(
      'No resources defined in project. Add at least one resource (agent, memory, evaluator, gateway, or harness) before deploying.'
    );
  });

  it('allows deploy when memories exist but no agents or gateways', async () => {
    mockRequireConfigRoot.mockReturnValue('/project/agentcore');
    mockValidate.mockReturnValue(undefined);
    mockReadProjectSpec.mockResolvedValue({
      name: 'test-project',
      runtimes: [],
      memories: [{ name: 'test-memory', strategies: [] }],
      agentCoreGateways: [],
    });
    mockReadAWSDeploymentTargets.mockResolvedValue([]);
    mockValidateAwsCredentials.mockResolvedValue(undefined);

    const result = await validateProject();

    expect(result.projectSpec.name).toBe('test-project');
    expect(result.isTeardownDeploy).toBe(false);
  });

  it('allows deploy when both agents and gateways exist', async () => {
    mockRequireConfigRoot.mockReturnValue('/project/agentcore');
    mockValidate.mockReturnValue(undefined);
    mockReadProjectSpec.mockResolvedValue({
      name: 'test-project',
      runtimes: [{ name: 'test-agent' }],
      agentCoreGateways: [{ name: 'test-gateway' }],
    });
    mockReadAWSDeploymentTargets.mockResolvedValue([]);
    mockValidateAwsCredentials.mockResolvedValue(undefined);

    const result = await validateProject();

    expect(result.projectSpec.name).toBe('test-project');
    expect(result.isTeardownDeploy).toBe(false);
  });
});

describe('validateHarnessCredentialReferences', () => {
  afterEach(() => vi.clearAllMocks());

  function mockConfigIO() {
    return { readHarnessSpec: mockReadHarnessSpec } as any;
  }

  it('passes when there are no harnesses', async () => {
    const projectSpec = { credentials: [], harnesses: [] } as any;
    await expect(validateHarnessCredentialReferences(projectSpec, mockConfigIO())).resolves.toBeUndefined();
  });

  it('passes when harness has no apiKeyCredential', async () => {
    const projectSpec = { credentials: [], harnesses: [{ name: 'h1', path: 'app/h1' }] } as any;
    mockReadHarnessSpec.mockResolvedValue({ name: 'h1', model: { provider: 'bedrock', modelId: 'claude' } });
    await expect(validateHarnessCredentialReferences(projectSpec, mockConfigIO())).resolves.toBeUndefined();
  });

  it('throws when apiKeyCredential references a credential not in project', async () => {
    const projectSpec = { credentials: [], harnesses: [{ name: 'h1', path: 'app/h1' }] } as any;
    mockReadHarnessSpec.mockResolvedValue({
      name: 'h1',
      model: { provider: 'open_ai', modelId: 'gpt-4o', apiKeyCredential: 'missingCred' },
    });
    await expect(validateHarnessCredentialReferences(projectSpec, mockConfigIO())).rejects.toThrow(
      /references credential "missingCred".*no credential with that name exists/
    );
  });

  it('throws when apiKeyCredential references an OAuth credential', async () => {
    const projectSpec = {
      credentials: [{ name: 'oauthCred', authorizerType: 'OAuthCredentialProvider' }],
      harnesses: [{ name: 'h1', path: 'app/h1' }],
    } as any;
    mockReadHarnessSpec.mockResolvedValue({
      name: 'h1',
      model: { provider: 'open_ai', modelId: 'gpt-4o', apiKeyCredential: 'oauthCred' },
    });
    await expect(validateHarnessCredentialReferences(projectSpec, mockConfigIO())).rejects.toThrow(
      /authorizerType "OAuthCredentialProvider"/
    );
  });

  it('passes when apiKeyCredential references a valid ApiKey credential', async () => {
    const projectSpec = {
      credentials: [{ name: 'goodCred', authorizerType: 'ApiKeyCredentialProvider' }],
      harnesses: [{ name: 'h1', path: 'app/h1' }],
    } as any;
    mockReadHarnessSpec.mockResolvedValue({
      name: 'h1',
      model: { provider: 'open_ai', modelId: 'gpt-4o', apiKeyCredential: 'goodCred' },
    });
    await expect(validateHarnessCredentialReferences(projectSpec, mockConfigIO())).resolves.toBeUndefined();
  });

  it('collects multiple harness errors', async () => {
    const projectSpec = {
      credentials: [{ name: 'oauthCred', authorizerType: 'OAuthCredentialProvider' }],
      harnesses: [
        { name: 'h1', path: 'app/h1' },
        { name: 'h2', path: 'app/h2' },
      ],
    } as any;
    mockReadHarnessSpec
      .mockResolvedValueOnce({
        name: 'h1',
        model: { provider: 'open_ai', modelId: 'gpt', apiKeyCredential: 'missing' },
      })
      .mockResolvedValueOnce({
        name: 'h2',
        model: { provider: 'gemini', modelId: 'gem', apiKeyCredential: 'oauthCred' },
      });
    await expect(validateHarnessCredentialReferences(projectSpec, mockConfigIO())).rejects.toThrow(
      /h1.*missing[\s\S]*h2.*oauthCred/
    );
  });
});

describe('formatError', () => {
  it('formats a simple Error', () => {
    const err = new Error('Something went wrong');
    const result = formatError(err);
    expect(result).toContain('Something went wrong');
  });

  it('includes stack trace when present', () => {
    const err = new Error('oops');
    const result = formatError(err);
    expect(result).toContain('Stack trace:');
    expect(result).toContain('oops');
  });

  it('formats nested cause errors', () => {
    const cause = new Error('root cause');
    const err = new Error('outer error', { cause });
    const result = formatError(err);
    expect(result).toContain('outer error');
    expect(result).toContain('Caused by:');
    expect(result).toContain('root cause');
  });

  it('formats non-Error values using String()', () => {
    expect(formatError('string error')).toBe('string error');
    expect(formatError(42)).toBe('42');
    expect(formatError(null)).toBe('null');
    expect(formatError(undefined)).toBe('undefined');
  });

  it('handles Error without stack', () => {
    const err = new Error('no stack');
    err.stack = undefined;
    const result = formatError(err);
    expect(result).toBe('no stack');
    expect(result).not.toContain('Stack trace:');
  });

  it('handles deeply nested causes', () => {
    const inner = new Error('inner');
    const mid = new Error('mid', { cause: inner });
    const outer = new Error('outer', { cause: mid });
    const result = formatError(outer);
    expect(result).toContain('outer');
    expect(result).toContain('mid');
    expect(result).toContain('inner');
  });
});
