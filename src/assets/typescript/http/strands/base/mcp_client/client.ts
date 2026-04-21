import { McpClient } from '@strands-agents/sdk';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
{{#if hasGateway}}
{{#if (includes gatewayAuthTypes "CUSTOM_JWT")}}
import { withAccessToken } from 'bedrock-agentcore/identity';
{{/if}}

{{#each gatewayProviders}}
{{#if (eq authType "CUSTOM_JWT")}}
async function getBearerToken{{snakeCase name}}(): Promise<string> {
  return withAccessToken(
    {
      providerName: '{{credentialProviderName}}',
      scopes: [{{#if scopes}}'{{scopes}}'{{/if}}],
      authFlow: 'M2M',
    },
    async (accessToken: string) => accessToken
  )();
}

{{/if}}
{{/each}}
{{#each gatewayProviders}}
export function get{{snakeCase name}}McpClient(): McpClient | null {
  const url = process.env.{{envVarName}};
  if (!url) {
    console.warn('{{envVarName}} not set — {{name}} gateway tools unavailable');
    return null;
  }
  {{#if (eq authType "CUSTOM_JWT")}}
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: async () => {
        const token = await getBearerToken{{snakeCase name}}();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    },
  });
  {{else if (eq authType "AWS_IAM")}}
  // AWS_IAM gateway auth for TypeScript is not yet supported — add SigV4 signing
  // to the transport's requestInit when the mcp-proxy-for-aws TS package is available.
  const transport = new StreamableHTTPClientTransport(new URL(url));
  {{else}}
  const transport = new StreamableHTTPClientTransport(new URL(url));
  {{/if}}
  return new McpClient({ transport });
}

{{/each}}
export function getAllGatewayMcpClients(): Array<McpClient | null> {
  const clients: Array<McpClient | null> = [];
  {{#each gatewayProviders}}
  clients.push(get{{snakeCase name}}McpClient());
  {{/each}}
  return clients;
}
{{else}}
{{#if isVpc}}
// VPC mode: external MCP endpoints are not reachable without a NAT gateway.
// Add an AgentCore Gateway with `agentcore add gateway`, or configure your own endpoint below.

export function getStreamableHttpMcpClient(): McpClient | null {
  return null;
}
{{else}}
// ExaAI provides information about code through web searches, crawling and code context searches through their platform. Requires no authentication
const EXAMPLE_MCP_ENDPOINT = 'https://mcp.exa.ai/mcp';

export function getStreamableHttpMcpClient(): McpClient {
  // to use an MCP server that supports bearer authentication, add a headers() callback to requestInit
  const transport = new StreamableHTTPClientTransport(new URL(EXAMPLE_MCP_ENDPOINT));
  return new McpClient({ transport });
}
{{/if}}
{{/if}}
