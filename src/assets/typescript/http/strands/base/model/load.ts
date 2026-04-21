{{#if (eq modelProvider "Bedrock")}}
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';

export function loadModel(): BedrockModel {
  return new BedrockModel({ modelId: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0' });
}
{{/if}}
{{#if (eq modelProvider "Anthropic")}}
import { AnthropicModel } from '@strands-agents/sdk/models/anthropic';
import { withApiKey } from 'bedrock-agentcore/identity';

const IDENTITY_PROVIDER_NAME = '{{identityProviders.[0].name}}';
const IDENTITY_ENV_VAR = '{{identityProviders.[0].envVarName}}';

async function getApiKey(): Promise<string> {
  if (process.env.LOCAL_DEV === '1') {
    const apiKey = process.env[IDENTITY_ENV_VAR];
    if (!apiKey) {
      throw new Error(`${IDENTITY_ENV_VAR} not found. Add ${IDENTITY_ENV_VAR}=your-key to .env.local`);
    }
    return apiKey;
  }
  return withApiKey({ providerName: IDENTITY_PROVIDER_NAME }, async (apiKey: string) => apiKey)();
}

export function loadModel(): AnthropicModel {
  return new AnthropicModel({
    clientArgs: { apiKey: getApiKey },
    modelId: 'claude-sonnet-4-5-20250929',
    maxTokens: 5000,
  });
}
{{/if}}
{{#if (eq modelProvider "OpenAI")}}
import { OpenAIModel } from '@strands-agents/sdk/models/openai';
import { withApiKey } from 'bedrock-agentcore/identity';

const IDENTITY_PROVIDER_NAME = '{{identityProviders.[0].name}}';
const IDENTITY_ENV_VAR = '{{identityProviders.[0].envVarName}}';

async function getApiKey(): Promise<string> {
  if (process.env.LOCAL_DEV === '1') {
    const apiKey = process.env[IDENTITY_ENV_VAR];
    if (!apiKey) {
      throw new Error(`${IDENTITY_ENV_VAR} not found. Add ${IDENTITY_ENV_VAR}=your-key to .env.local`);
    }
    return apiKey;
  }
  return withApiKey({ providerName: IDENTITY_PROVIDER_NAME }, async (apiKey: string) => apiKey)();
}

export function loadModel(): OpenAIModel {
  return new OpenAIModel({
    clientArgs: { apiKey: getApiKey },
    modelId: 'gpt-4.1',
  });
}
{{/if}}
{{#if (eq modelProvider "Gemini")}}
import { GoogleModel } from '@strands-agents/sdk/models/google';
import { withApiKey } from 'bedrock-agentcore/identity';

const IDENTITY_PROVIDER_NAME = '{{identityProviders.[0].name}}';
const IDENTITY_ENV_VAR = '{{identityProviders.[0].envVarName}}';

async function getApiKey(): Promise<string> {
  if (process.env.LOCAL_DEV === '1') {
    const apiKey = process.env[IDENTITY_ENV_VAR];
    if (!apiKey) {
      throw new Error(`${IDENTITY_ENV_VAR} not found. Add ${IDENTITY_ENV_VAR}=your-key to .env.local`);
    }
    return apiKey;
  }
  return withApiKey({ providerName: IDENTITY_PROVIDER_NAME }, async (apiKey: string) => apiKey)();
}

export function loadModel(): GoogleModel {
  return new GoogleModel({
    clientArgs: { apiKey: getApiKey },
    modelId: 'gemini-2.5-flash',
  });
}
{{/if}}
