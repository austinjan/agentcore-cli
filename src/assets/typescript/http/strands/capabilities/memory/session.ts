import {
  AgentCoreMemoryConfig,
{{#if memoryProviders.[0].strategies.length}}
  RetrievalConfig,
{{/if}}
  AgentCoreMemorySessionManager,
} from 'bedrock-agentcore/memory/strands';

const MEMORY_ID = process.env.{{memoryProviders.[0].envVarName}};
const REGION = process.env.AWS_REGION;

export function getMemorySessionManager(
  sessionId: string,
  actorId: string
): AgentCoreMemorySessionManager | null {
  if (!MEMORY_ID) {
    return null;
  }

{{#if memoryProviders.[0].strategies.length}}
  const retrievalConfig: Record<string, RetrievalConfig> = {
{{#if (includes memoryProviders.[0].strategies "SEMANTIC")}}
    [`/users/${actorId}/facts`]: { topK: 3, relevanceScore: 0.5 },
{{/if}}
{{#if (includes memoryProviders.[0].strategies "USER_PREFERENCE")}}
    [`/users/${actorId}/preferences`]: { topK: 3, relevanceScore: 0.5 },
{{/if}}
{{#if (includes memoryProviders.[0].strategies "SUMMARIZATION")}}
    [`/summaries/${actorId}/${sessionId}`]: { topK: 3, relevanceScore: 0.5 },
{{/if}}
  };
{{/if}}

  const config: AgentCoreMemoryConfig = {
    memoryId: MEMORY_ID,
    sessionId,
    actorId,
{{#if memoryProviders.[0].strategies.length}}
    retrievalConfig,
{{/if}}
  };

  return new AgentCoreMemorySessionManager(config, REGION);
}
