/**
 * Behavior tests for issue #924: handleDeploy must propagate the resolved
 * target's region from aws-targets.json onto AWS_REGION / AWS_DEFAULT_REGION
 * for the duration of the deploy, and restore the previous values afterwards
 * (on both happy and error paths). It must also leave env untouched when no
 * target is found.
 */
// Import _after_ mocks ---------------------------------------------------------
import { handleDeploy } from '../actions.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- ConfigIO mock ----------------------------------------------------------

const mockResolveAWSDeploymentTargets = vi.fn();
const mockReadProjectSpec = vi.fn();
const mockReadDeployedState = vi.fn();
const mockWriteDeployedState = vi.fn();

vi.mock('../../../../lib', () => ({
  APP_DIR: 'app',
  ConfigIO: class MockConfigIO {
    resolveAWSDeploymentTargets = mockResolveAWSDeploymentTargets;
    readProjectSpec = mockReadProjectSpec;
    readDeployedState = mockReadDeployedState;
    writeDeployedState = mockWriteDeployedState;
    getConfigRoot = () => '/tmp/test-deploy';
  },
  SecureCredentials: class {},
}));

// ---- Logging mock -----------------------------------------------------------

vi.mock('../../../logging', () => ({
  ExecLogger: class MockExecLogger {
    startStep = vi.fn();
    endStep = vi.fn();
    log = vi.fn();
    finalize = vi.fn();
    getRelativeLogPath = vi.fn().mockReturnValue('agentcore/.cli/logs/deploy/mock.log');
  },
}));

// ---- AWS account / credentials mock -----------------------------------------

vi.mock('../../../aws/account', () => ({
  validateAwsCredentials: vi.fn().mockResolvedValue(undefined),
}));

// ---- CDK toolkit-lib mock ---------------------------------------------------

vi.mock('../../../cdk/toolkit-lib', () => ({
  createSwitchableIoHost: vi.fn(),
  silentIoHost: {},
}));

// ---- CloudFormation outputs mock --------------------------------------------

vi.mock('../../../cloudformation', () => ({
  buildDeployedState: vi.fn(),
  getStackOutputs: vi.fn(),
  parseAgentOutputs: vi.fn(),
  parseEvaluatorOutputs: vi.fn(),
  parseGatewayOutputs: vi.fn(),
  parseMemoryOutputs: vi.fn(),
  parseOnlineEvalOutputs: vi.fn(),
  parsePolicyEngineOutputs: vi.fn(),
  parsePolicyOutputs: vi.fn(),
  parseRuntimeEndpointOutputs: vi.fn(),
}));

// ---- operations/deploy mock — validateProject is the first heavy step -------

const mockValidateProject = vi.fn();

vi.mock('../../../operations/deploy', () => ({
  validateProject: (...args: unknown[]) => mockValidateProject(...args),
  buildCdkProject: vi.fn(),
  synthesizeCdk: vi.fn(),
  checkStackDeployability: vi.fn(),
  checkBootstrapNeeded: vi.fn(),
  bootstrapEnvironment: vi.fn(),
  performStackTeardown: vi.fn(),
  setupApiKeyProviders: vi.fn(),
  setupOAuth2Providers: vi.fn(),
  hasIdentityApiProviders: vi.fn().mockReturnValue(false),
  hasIdentityOAuthProviders: vi.fn().mockReturnValue(false),
  setupTransactionSearch: vi.fn(),
  getAllCredentials: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../operations/deploy/gateway-status', () => ({
  formatTargetStatus: vi.fn(),
  getGatewayTargetStatuses: vi.fn(),
}));

vi.mock('../../../operations/deploy/post-deploy-ab-tests', () => ({
  deleteOrphanedABTests: vi.fn(),
  setupABTests: vi.fn(),
}));

vi.mock('../../../operations/deploy/post-deploy-config-bundles', () => ({
  resolveConfigBundleComponentKeys: vi.fn(),
  setupConfigBundles: vi.fn(),
}));

vi.mock('../../../operations/deploy/post-deploy-http-gateways', () => ({
  setupHttpGateways: vi.fn(),
}));

vi.mock('../../../operations/deploy/post-deploy-online-evals', () => ({
  enableOnlineEvalConfigs: vi.fn(),
}));

// =============================================================================

describe('handleDeploy region override (#924)', () => {
  let savedRegion: string | undefined;
  let savedDefaultRegion: string | undefined;

  beforeEach(() => {
    savedRegion = process.env.AWS_REGION;
    savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
    process.env.AWS_REGION = 'us-east-1';
    delete process.env.AWS_DEFAULT_REGION;
    vi.clearAllMocks();
    // Default: a single target whose region differs from the env-default.
    mockResolveAWSDeploymentTargets.mockResolvedValue([
      { name: 'default', account: '123456789012', region: 'eu-west-2' },
    ]);
    mockReadProjectSpec.mockResolvedValue({ runtimes: [], agentCoreGateways: [] });
  });

  afterEach(() => {
    if (savedRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = savedRegion;
    if (savedDefaultRegion === undefined) delete process.env.AWS_DEFAULT_REGION;
    else process.env.AWS_DEFAULT_REGION = savedDefaultRegion;
  });

  it('propagates target.region to process.env during execution and restores afterwards', async () => {
    let observedRegion: string | undefined;
    let observedDefaultRegion: string | undefined;

    // validateProject is the first heavy step after the env override is applied.
    mockValidateProject.mockImplementation(() => {
      observedRegion = process.env.AWS_REGION;
      observedDefaultRegion = process.env.AWS_DEFAULT_REGION;
      // Return a structure that triggers the early "no stacks" / no-resources
      // path quickly so we don't have to mock the whole pipeline.
      return Promise.reject(new Error('forced-stop-after-region-check'));
    });

    const result = await handleDeploy({ target: 'default', autoConfirm: true });

    expect(result.success).toBe(false);
    expect(observedRegion).toBe('eu-west-2');
    expect(observedDefaultRegion).toBe('eu-west-2');
    // After the call, env must be restored to its prior values.
    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
  });

  it('restores env even when an inner step throws', async () => {
    mockValidateProject.mockRejectedValue(new Error('boom'));

    const result = await handleDeploy({ target: 'default', autoConfirm: true });
    expect(result.success).toBe(false);

    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
  });

  it('does not mutate env when the requested target cannot be resolved', async () => {
    mockResolveAWSDeploymentTargets.mockResolvedValue([
      { name: 'other', account: '123456789012', region: 'ap-southeast-2' },
    ]);

    const result = await handleDeploy({ target: 'default', autoConfirm: true });
    expect(result.success).toBe(false);
    // validateProject must not have been reached.
    expect(mockValidateProject).not.toHaveBeenCalled();

    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
  });
});
