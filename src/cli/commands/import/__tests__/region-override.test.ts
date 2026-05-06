/**
 * Behavior tests for issue #924: handleImport must propagate the resolved
 * target's region (or the YAML-supplied region as a fallback) onto AWS_REGION
 * / AWS_DEFAULT_REGION for the duration of the import, and restore them
 * afterwards on every exit path (happy, early return, thrown error). It must
 * also leave env untouched when no target is involved at all.
 */
// Use the real yaml-parser since we generate our own YAML below.
import { handleImport } from '../actions.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- ConfigIO mock ----------------------------------------------------------

const mockReadProjectSpec = vi.fn();
const mockWriteProjectSpec = vi.fn();
const mockReadAWSDeploymentTargets = vi.fn();
const mockWriteAWSDeploymentTargets = vi.fn();
const mockReadDeployedState = vi.fn();
const mockWriteDeployedState = vi.fn();
const mockFindConfigRoot = vi.fn();

vi.mock('../../../../lib', () => ({
  APP_DIR: 'app',
  ConfigIO: class MockConfigIO {
    readProjectSpec = mockReadProjectSpec;
    writeProjectSpec = mockWriteProjectSpec;
    readAWSDeploymentTargets = mockReadAWSDeploymentTargets;
    writeAWSDeploymentTargets = mockWriteAWSDeploymentTargets;
    readDeployedState = mockReadDeployedState;
    writeDeployedState = mockWriteDeployedState;
  },
  findConfigRoot: (...args: unknown[]) => mockFindConfigRoot(...args),
}));

// ---- Various mocks ---------------------------------------------------------

const mockValidateAwsCredentials = vi.fn();
vi.mock('../../../aws/account', () => ({
  validateAwsCredentials: (...args: unknown[]) => mockValidateAwsCredentials(...args),
}));

vi.mock('../../../cdk/local-cdk-project', () => ({
  LocalCdkProject: vi.fn(),
}));

vi.mock('../../../cdk/toolkit-lib', () => ({
  silentIoHost: {},
}));

vi.mock('../../../logging', () => ({
  ExecLogger: class MockExecLogger {
    startStep = vi.fn();
    endStep = vi.fn();
    log = vi.fn();
    finalize = vi.fn();
    getRelativeLogPath = vi.fn().mockReturnValue('agentcore/.cli/logs/import/mock.log');
    logFilePath = 'agentcore/.cli/logs/import/mock.log';
  },
}));

vi.mock('../../../operations/deploy', () => ({
  buildCdkProject: vi.fn(),
  synthesizeCdk: vi.fn(),
}));

vi.mock('../../../operations/python/setup', () => ({
  setupPythonProject: vi.fn().mockResolvedValue({ status: 'success' }),
}));

const mockExecuteCdkImportPipeline = vi.fn();
vi.mock('../import-pipeline', () => ({
  executeCdkImportPipeline: (...args: unknown[]) => mockExecuteCdkImportPipeline(...args),
}));

// import-utils helpers
vi.mock('../import-utils', async () => {
  const actual = await vi.importActual<typeof import('../import-utils')>('../import-utils');
  return { ...actual };
});

// =============================================================================

describe('handleImport region override (#924)', () => {
  let savedRegion: string | undefined;
  let savedDefaultRegion: string | undefined;
  let tmpDir: string;
  let yamlPath: string;

  const writeYaml = (region: string, withPhysicalIds: boolean): void => {
    const physicalIdLines = withPhysicalIds
      ? `      agent_id: TESTAGENT123ABC\n      agent_arn: arn:aws:bedrock-agentcore:${region}:111122223333:runtime/TESTAGENT123ABC\n`
      : `      agent_id: null\n      agent_arn: null\n`;
    const yaml = `
default_agent: test_agent
agents:
  test_agent:
    name: test_agent
    entrypoint: main.py
    deployment_type: container
    runtime_type: PYTHON_3_12
    aws:
      account: '111122223333'
      region: ${region}
      network_configuration:
        network_mode: PUBLIC
      protocol_configuration:
        server_protocol: HTTP
      observability:
        enabled: true
    bedrock_agentcore:
${physicalIdLines}    memory:
      mode: NO_MEMORY
`;
    fs.writeFileSync(yamlPath, yaml);
  };

  beforeEach(() => {
    savedRegion = process.env.AWS_REGION;
    savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
    process.env.AWS_REGION = 'us-east-1';
    delete process.env.AWS_DEFAULT_REGION;
    vi.clearAllMocks();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-region-'));
    yamlPath = path.join(tmpDir, '.bedrock_agentcore.yaml');

    // Pretend we are inside an agentcore project rooted at tmpDir/agentcore.
    const configRoot = path.join(tmpDir, 'agentcore');
    fs.mkdirSync(configRoot, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });
    mockFindConfigRoot.mockReturnValue(configRoot);

    mockReadProjectSpec.mockResolvedValue({
      name: 'TestProject',
      runtimes: [],
      memories: [],
      credentials: [],
    });
    mockWriteProjectSpec.mockResolvedValue(undefined);
    mockValidateAwsCredentials.mockResolvedValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = savedRegion;
    if (savedDefaultRegion === undefined) delete process.env.AWS_DEFAULT_REGION;
    else process.env.AWS_DEFAULT_REGION = savedDefaultRegion;
  });

  it('propagates resolved target region to env during the strict (physical-IDs) path', async () => {
    writeYaml('eu-west-1', /* withPhysicalIds */ true);

    // YAML says eu-west-1 but the project's targets file says eu-west-2 — the
    // resolved target's region must win.
    mockReadAWSDeploymentTargets.mockResolvedValue([{ name: 'default', account: '111122223333', region: 'eu-west-2' }]);

    let observedRegion: string | undefined;
    let observedDefaultRegion: string | undefined;
    mockExecuteCdkImportPipeline.mockImplementation(() => {
      observedRegion = process.env.AWS_REGION;
      observedDefaultRegion = process.env.AWS_DEFAULT_REGION;
      // Force-stop the pipeline so we don't have to mock CDK output parsing.
      return Promise.reject(new Error('forced-stop-after-region-check'));
    });

    const result = await handleImport({ source: yamlPath });

    expect(result.success).toBe(false);
    expect(observedRegion).toBe('eu-west-2');
    expect(observedDefaultRegion).toBe('eu-west-2');
    // Env must be restored to its prior value.
    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
  });

  it('restores env on every exit path, including thrown errors', async () => {
    writeYaml('eu-west-1', /* withPhysicalIds */ true);

    mockReadAWSDeploymentTargets.mockResolvedValue([{ name: 'default', account: '111122223333', region: 'eu-west-1' }]);

    mockValidateAwsCredentials.mockRejectedValue(new Error('creds blew up'));

    const result = await handleImport({ source: yamlPath });
    expect(result.success).toBe(false);

    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();
  });

  it('also propagates region in the no-physical-IDs (light) path when a target is present', async () => {
    // YAML region differs from the resolved target's region so we can
    // distinguish which one wins in each phase of the light path.
    writeYaml('eu-west-3', /* withPhysicalIds */ false);

    // Observe env at two points along the light path:
    //  - readAWSDeploymentTargets() runs *after* the YAML region was applied
    //    but *before* the resolved target's region is applied, so it should
    //    see the YAML region.
    //  - writeProjectSpec() runs *after* the resolved target region was
    //    applied, so it should see the target region.
    let observedAtTargetsRead: { region?: string; defaultRegion?: string } = {};
    mockReadAWSDeploymentTargets.mockImplementation(() => {
      observedAtTargetsRead = {
        region: process.env.AWS_REGION,
        defaultRegion: process.env.AWS_DEFAULT_REGION,
      };
      return Promise.resolve([{ name: 'default', account: '111122223333', region: 'ap-southeast-2' }]);
    });

    let observedAtConfigWrite: { region?: string; defaultRegion?: string } = {};
    mockWriteProjectSpec.mockImplementation(() => {
      observedAtConfigWrite = {
        region: process.env.AWS_REGION,
        defaultRegion: process.env.AWS_DEFAULT_REGION,
      };
      return Promise.resolve();
    });

    const result = await handleImport({ source: yamlPath });

    // Phase 1: YAML region was promoted before reading targets.
    expect(observedAtTargetsRead.region).toBe('eu-west-3');
    expect(observedAtTargetsRead.defaultRegion).toBe('eu-west-3');

    // Phase 2: resolved target region overrides the YAML hint.
    expect(observedAtConfigWrite.region).toBe('ap-southeast-2');
    expect(observedAtConfigWrite.defaultRegion).toBe('ap-southeast-2');

    // Env must be restored at the end either way.
    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();

    // Pipeline shouldn't have run for the light path.
    expect(mockExecuteCdkImportPipeline).not.toHaveBeenCalled();
    // Light path returns success even with no resources to import.
    expect(result.success).toBe(true);
  });
});
