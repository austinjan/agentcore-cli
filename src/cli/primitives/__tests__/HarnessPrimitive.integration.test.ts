import { ConfigIO, getEnvVar } from '../../../lib';
import { HarnessPrimitive } from '../HarnessPrimitive';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Integration test for HarnessPrimitive.add(): exercises the real ConfigIO against
 * a temp directory to verify agentcore.json, harness.json, and .env.local end up
 * consistent after a full add. Would catch the useCreateFlow.ts:497 class of bug
 * (config field dropped between layers).
 */
describe('HarnessPrimitive integration (real ConfigIO + tmpdir)', () => {
  let testDir: string;
  let agentcoreDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'harness-integ-'));
    agentcoreDir = join(testDir, 'agentcore');
    await mkdir(agentcoreDir, { recursive: true });
    await writeFile(
      join(agentcoreDir, 'agentcore.json'),
      JSON.stringify(
        {
          $schema: 'https://schema.agentcore.aws.dev/v1/agentcore.json',
          name: 'IntegProject',
          version: 1,
          managedBy: 'CDK',
          runtimes: [],
          memories: [],
          credentials: [],
          evaluators: [],
          onlineEvalConfigs: [],
          agentCoreGateways: [],
          policyEngines: [],
          harnesses: [],
        },
        null,
        2
      )
    );
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates OpenAI harness with API key: agentcore.json + harness.json + .env.local are all consistent', async () => {
    const primitive = new HarnessPrimitive();

    const result = await primitive.add({
      name: 'H1',
      modelProvider: 'open_ai',
      modelId: 'gpt-4o',
      apiKey: 'sk-test-integration',
      skipMemory: true,
      configBaseDir: agentcoreDir,
    });

    expect(result.success).toBe(true);

    // agentcore.json should have the new credential and harness entry
    const configIO = new ConfigIO({ baseDir: agentcoreDir });
    const project = await configIO.readProjectSpec();
    const cred = project.credentials.find(c => c.name === 'IntegProjectOpenAI');
    expect(cred).toBeDefined();
    expect(cred?.authorizerType).toBe('ApiKeyCredentialProvider');
    const harnessEntry = project.harnesses?.find(h => h.name === 'H1');
    expect(harnessEntry).toBeDefined();

    // harness.json should reference the credential by name, NOT by ARN
    const harnessSpec = await configIO.readHarnessSpec('H1');
    expect(harnessSpec.model.apiKeyCredential).toBe('IntegProjectOpenAI');
    expect(harnessSpec.model.apiKeyArn).toBeUndefined();

    // .env.local should contain the API key under the expected env var name
    const storedKey = await getEnvVar('AGENTCORE_CREDENTIAL_INTEGPROJECTOPENAI', agentcoreDir);
    expect(storedKey).toBe('sk-test-integration');
  });

  it('creates harness with BYO apiKeyCredentialArn: writes apiKeyArn, does not create credential', async () => {
    const primitive = new HarnessPrimitive();
    const byoArn =
      'arn:aws:bedrock-agentcore:us-east-1:123456789012:token-vault/default/apikeycredentialprovider/my-key';

    const result = await primitive.add({
      name: 'H2',
      modelProvider: 'open_ai',
      modelId: 'gpt-4o',
      apiKeyCredentialArn: byoArn,
      skipMemory: true,
      configBaseDir: agentcoreDir,
    });

    expect(result.success).toBe(true);

    const configIO = new ConfigIO({ baseDir: agentcoreDir });
    const project = await configIO.readProjectSpec();
    expect(project.credentials).toHaveLength(0);

    const harnessSpec = await configIO.readHarnessSpec('H2');
    expect(harnessSpec.model.apiKeyArn).toBe(byoArn);
    expect(harnessSpec.model.apiKeyCredential).toBeUndefined();
  });

  it('two OpenAI harnesses with same API key: dedup to a single project-scoped credential', async () => {
    const primitive = new HarnessPrimitive();

    const first = await primitive.add({
      name: 'H1',
      modelProvider: 'open_ai',
      modelId: 'gpt-4o',
      apiKey: 'shared-key',
      skipMemory: true,
      configBaseDir: agentcoreDir,
    });
    expect(first.success).toBe(true);

    const second = await primitive.add({
      name: 'H2',
      modelProvider: 'open_ai',
      modelId: 'gpt-4o',
      apiKey: 'shared-key',
      skipMemory: true,
      configBaseDir: agentcoreDir,
    });
    expect(second.success).toBe(true);

    const configIO = new ConfigIO({ baseDir: agentcoreDir });
    const project = await configIO.readProjectSpec();
    const openaiCreds = project.credentials.filter(c => c.name.endsWith('OpenAI'));
    expect(openaiCreds).toHaveLength(1);

    const h1 = await configIO.readHarnessSpec('H1');
    const h2 = await configIO.readHarnessSpec('H2');
    expect(h1.model.apiKeyCredential).toBe('IntegProjectOpenAI');
    expect(h2.model.apiKeyCredential).toBe('IntegProjectOpenAI');
  });

  it('OpenAI + Gemini harnesses with same key: two distinct provider-scoped credentials, no cross-contamination', async () => {
    const primitive = new HarnessPrimitive();

    const openaiResult = await primitive.add({
      name: 'OpenAIHarness',
      modelProvider: 'open_ai',
      modelId: 'gpt-4o',
      apiKey: 'shared-key',
      skipMemory: true,
      configBaseDir: agentcoreDir,
    });
    expect(openaiResult.success).toBe(true);

    const geminiResult = await primitive.add({
      name: 'GeminiHarness',
      modelProvider: 'gemini',
      modelId: 'gemini-2.5-flash',
      apiKey: 'shared-key',
      skipMemory: true,
      configBaseDir: agentcoreDir,
    });
    expect(geminiResult.success).toBe(true);

    const configIO = new ConfigIO({ baseDir: agentcoreDir });
    const project = await configIO.readProjectSpec();
    const credNames = project.credentials.map(c => c.name).sort();
    expect(credNames).toEqual(['IntegProjectGemini', 'IntegProjectOpenAI']);

    const openaiHarness = await configIO.readHarnessSpec('OpenAIHarness');
    const geminiHarness = await configIO.readHarnessSpec('GeminiHarness');
    expect(openaiHarness.model.apiKeyCredential).toBe('IntegProjectOpenAI');
    expect(geminiHarness.model.apiKeyCredential).toBe('IntegProjectGemini');
  });

  it('rejects non-bedrock provider with no credential source', async () => {
    const primitive = new HarnessPrimitive();
    const result = await primitive.add({
      name: 'Broken',
      modelProvider: 'open_ai',
      modelId: 'gpt-4o',
      skipMemory: true,
      configBaseDir: agentcoreDir,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/requires a credential/);
    }

    // Verify nothing was written
    const configIO = new ConfigIO({ baseDir: agentcoreDir });
    const project = await configIO.readProjectSpec();
    expect(project.harnesses).toHaveLength(0);
    expect(project.credentials).toHaveLength(0);
  });

  it('rejects both --api-key and --api-key-arn set simultaneously', async () => {
    const primitive = new HarnessPrimitive();
    const result = await primitive.add({
      name: 'Broken',
      modelProvider: 'open_ai',
      modelId: 'gpt-4o',
      apiKey: 'sk-test',
      apiKeyCredentialArn:
        'arn:aws:bedrock-agentcore:us-east-1:123456789012:token-vault/default/apikeycredentialprovider/my-key',
      skipMemory: true,
      configBaseDir: agentcoreDir,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/OR --api-key-arn/);
    }
  });
});
