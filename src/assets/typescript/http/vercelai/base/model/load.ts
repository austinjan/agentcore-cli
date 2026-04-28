{{#if (eq modelProvider "Bedrock")}}
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

export function loadModel() {
  return bedrock('us.anthropic.claude-sonnet-4-5-20250514-v1:0');
}
{{/if}}
{{#if (eq modelProvider "Anthropic")}}
import { createAnthropic } from '@ai-sdk/anthropic';
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

const anthropic = createAnthropic({ apiKey: getApiKey });

export function loadModel() {
  return anthropic('claude-sonnet-4-5-20250929');
}
{{/if}}
{{#if (eq modelProvider "OpenAI")}}
import { createOpenAI } from '@ai-sdk/openai';
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

const openai = createOpenAI({ apiKey: getApiKey });

export function loadModel() {
  return openai('gpt-4.1');
}
{{/if}}
{{#if (eq modelProvider "Gemini")}}
import { createGoogleGenerativeAI } from '@ai-sdk/google';
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

const google = createGoogleGenerativeAI({ apiKey: getApiKey });

export function loadModel() {
  return google('gemini-2.5-flash');
}
{{/if}}
