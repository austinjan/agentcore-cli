import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { Agent, tool } from '@strands-agents/sdk';
import { loadModel } from './model/load.js';
{{#if hasGateway}}
import { getAllGatewayMcpClients } from './mcp_client/client.js';
{{else}}
import { getStreamableHttpMcpClient } from './mcp_client/client.js';
{{/if}}
{{#if hasMemory}}
import { getMemorySessionManager } from './memory/session.js';
{{/if}}
{{#if sessionStorageMountPath}}
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
{{/if}}

// Define a collection of MCP clients
{{#if hasGateway}}
const mcpClients = getAllGatewayMcpClients();
{{else}}
const mcpClients = [getStreamableHttpMcpClient()].filter(Boolean);
{{/if}}

// Define a collection of tools used by the model
const tools: unknown[] = [];

// Define a simple function tool
const addNumbers = tool({
  name: 'add_numbers',
  description: 'Return the sum of two numbers',
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: { type: 'number' },
    },
    required: ['a', 'b'],
  },
  handler: async ({ a, b }: { a: number; b: number }) => a + b,
});
tools.push(addNumbers);

{{#if sessionStorageMountPath}}
const SESSION_STORAGE_PATH = '{{sessionStorageMountPath}}';

function safeResolve(p: string): string {
  const base = path.resolve(SESSION_STORAGE_PATH);
  const resolved = path.resolve(base, p.replace(/^\/+/, ''));
  if (!resolved.startsWith(base)) {
    throw new Error(`Path '${p}' is outside the storage boundary`);
  }
  return resolved;
}

const fileRead = tool({
  name: 'file_read',
  description: 'Read a file from persistent storage. The path is relative to the storage root.',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
  handler: async ({ path: p }: { path: string }) => {
    try {
      return await fs.readFile(safeResolve(p), 'utf-8');
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },
});

const fileWrite = tool({
  name: 'file_write',
  description: 'Write content to a file in persistent storage. The path is relative to the storage root.',
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' }, content: { type: 'string' } },
    required: ['path', 'content'],
  },
  handler: async ({ path: p, content }: { path: string; content: string }) => {
    try {
      const full = safeResolve(p);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf-8');
      return `Written to ${p}`;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },
});

const listFiles = tool({
  name: 'list_files',
  description: 'List files in persistent storage. The directory is relative to the storage root.',
  inputSchema: {
    type: 'object',
    properties: { directory: { type: 'string' } },
  },
  handler: async ({ directory = '' }: { directory?: string }) => {
    try {
      const entries = await fs.readdir(safeResolve(directory));
      return entries.length > 0 ? entries.join('\n') : '(empty directory)';
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },
});

tools.push(fileRead, fileWrite, listFiles);
{{/if}}

// Add MCP clients to tools if available
for (const mcpClient of mcpClients) {
  if (mcpClient) {
    tools.push(mcpClient);
  }
}

const SYSTEM_PROMPT = `
You are a helpful assistant. Use tools when appropriate.
{{#if sessionStorageMountPath}}
You have persistent storage at {{sessionStorageMountPath}}. Use file tools to read and write files. Data persists across sessions.
{{/if}}
`;

{{#if hasMemory}}
const agentCache = new Map<string, Agent>();

function getOrCreateAgent(sessionId: string, userId: string): Agent {
  const key = `${sessionId}/${userId}`;
  let agent = agentCache.get(key);
  if (!agent) {
    agent = new Agent({
      model: loadModel(),
      sessionManager: getMemorySessionManager(sessionId, userId),
      systemPrompt: SYSTEM_PROMPT,
      tools,
    });
    agentCache.set(key, agent);
  }
  return agent;
}
{{else}}
let cachedAgent: Agent | null = null;

function getOrCreateAgent(): Agent {
  if (!cachedAgent) {
    cachedAgent = new Agent({
      model: loadModel(),
      systemPrompt: SYSTEM_PROMPT,
      tools,
    });
  }
  return cachedAgent;
}
{{/if}}

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    async *process(payload: { prompt?: string }, context: { sessionId?: string; userId?: string }) {
{{#if hasMemory}}
      const sessionId = context.sessionId ?? 'default-session';
      const userId = context.userId ?? 'default-user';
      const agent = getOrCreateAgent(sessionId, userId);
{{else}}
      const agent = getOrCreateAgent();
{{/if}}

      for await (const event of agent.stream(payload.prompt ?? '')) {
        if (event.type === 'contentBlockDelta' && event.delta?.type === 'textDelta') {
          yield { data: event.delta.text };
        }
      }
    },
  },
});

app.run();
