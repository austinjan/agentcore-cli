/**
 * AWS client wrappers for Dataset example management operations.
 *
 * The Dataset API lives on the control plane. Example management endpoints:
 *   POST   /datasets/{datasetId}/examples           → AddDatasetExamples
 *   DELETE /datasets/{datasetId}/examples           → RemoveDatasetExamples
 *   GET    /datasets/{datasetId}/examples           → ListDatasetExamples
 *
 * Uses direct HTTP requests with SigV4 signing against the control plane
 * because the @aws-sdk/client-bedrock-agentcore-control package does not yet
 * include Dataset commands.
 */
import { getCredentialProvider } from './account';
import { dnsSuffix } from './partition';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';

// ============================================================================
// Types
// ============================================================================

export interface AddDatasetExamplesOptions {
  region: string;
  datasetId: string;
  /** Parsed JSON objects to add as examples. Each object becomes one example payload. */
  examples: Record<string, unknown>[];
}

export interface AddDatasetExamplesResult {
  addedCount: number;
}

export interface RemoveDatasetExamplesOptions {
  region: string;
  datasetId: string;
  /** Example IDs to remove. */
  exampleIds: string[];
}

export interface DatasetExampleSummary {
  exampleId: string;
  payload?: Record<string, unknown>;
}

export interface ListDatasetExamplesOptions {
  region: string;
  datasetId: string;
  maxResults?: number;
  nextToken?: string;
}

export interface ListDatasetExamplesResult {
  examples: DatasetExampleSummary[];
  nextToken?: string;
}

// ============================================================================
// HTTP signing helper
// ============================================================================

function getControlPlaneEndpoint(region: string): string {
  const stage = process.env.AGENTCORE_STAGE?.toLowerCase();
  if (stage === 'beta') return `https://beta.${region}.elcapcp.genesis-primitives.aws.dev`;
  if (stage === 'gamma') return `https://gamma.${region}.elcapcp.genesis-primitives.aws.dev`;
  return `https://bedrock-agentcore-control.${region}.${dnsSuffix(region)}`;
}

async function signedRequest(options: {
  region: string;
  method: string;
  path: string;
  body?: string;
}): Promise<unknown> {
  const { region, method, path, body } = options;
  const endpoint = getControlPlaneEndpoint(region);
  const url = new URL(path, endpoint);

  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const request = new HttpRequest({
    method,
    protocol: 'https:',
    hostname: url.hostname,
    path: url.pathname,
    ...(Object.keys(query).length > 0 && { query }),
    headers: {
      'Content-Type': 'application/json',
      host: url.hostname,
    },
    ...(body && { body }),
  });

  const credentials = getCredentialProvider() ?? defaultProvider();
  const signer = new SignatureV4({
    service: 'bedrock-agentcore',
    region,
    credentials,
    sha256: Sha256,
  });

  const signedReq = await signer.sign(request);

  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: signedReq.headers as Record<string, string>,
    ...(body && { body }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Dataset API error (${response.status}): ${errorBody}`);
  }

  if (response.status === 204) return {};
  return response.json();
}

// ============================================================================
// Control Plane Operations
// ============================================================================

/**
 * Add examples to a dataset.
 *
 * Each element in `examples` is serialised as the `payload` field of one
 * dataset example.
 */
export async function addDatasetExamples(options: AddDatasetExamplesOptions): Promise<AddDatasetExamplesResult> {
  const { region, datasetId, examples } = options;
  const body = JSON.stringify({
    examples: examples.map(payload => ({ payload })),
  });

  const data = (await signedRequest({
    region,
    method: 'POST',
    path: `/datasets/${datasetId}/examples`,
    body,
  })) as { examples?: unknown[] };

  return { addedCount: data.examples?.length ?? examples.length };
}

/**
 * Remove examples from a dataset by their IDs.
 */
export async function removeDatasetExamples(options: RemoveDatasetExamplesOptions): Promise<void> {
  const { region, datasetId, exampleIds } = options;
  const body = JSON.stringify({ exampleIds });

  await signedRequest({
    region,
    method: 'DELETE',
    path: `/datasets/${datasetId}/examples`,
    body,
  });
}

/**
 * List examples for a dataset (one page).
 */
export async function listDatasetExamples(options: ListDatasetExamplesOptions): Promise<ListDatasetExamplesResult> {
  const { region, datasetId, maxResults, nextToken } = options;
  const params = new URLSearchParams();
  if (maxResults) params.set('maxResults', String(maxResults));
  if (nextToken) params.set('nextToken', nextToken);
  const query = params.toString();

  const data = (await signedRequest({
    region,
    method: 'GET',
    path: `/datasets/${datasetId}/examples${query ? `?${query}` : ''}`,
  })) as { examples?: DatasetExampleSummary[]; nextToken?: string };

  return {
    examples: data.examples ?? [],
    nextToken: data.nextToken,
  };
}

/**
 * List all examples for a dataset, paginating through all results.
 */
export async function listAllDatasetExamples(options: {
  region: string;
  datasetId: string;
}): Promise<DatasetExampleSummary[]> {
  const all: DatasetExampleSummary[] = [];
  let nextToken: string | undefined;

  do {
    const result = await listDatasetExamples({
      region: options.region,
      datasetId: options.datasetId,
      maxResults: 100,
      nextToken,
    });
    all.push(...result.examples);
    nextToken = result.nextToken;
  } while (nextToken);

  return all;
}
