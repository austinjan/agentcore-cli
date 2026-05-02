/**
 * Post-deploy dataset source sync.
 *
 * CFN's `AWS::BedrockAgentCore::Dataset` resource does not support uploading
 * examples on update (the `Source` property is createOnly). This step runs
 * after CDK deploy and uploads examples from a local source file whenever the
 * file has changed since the last deploy.
 *
 * Algorithm per dataset:
 * 1. If the dataset has no `source` field, skip.
 * 2. Hash the source file contents (SHA-256).
 * 3. Compare against `sourceHash` stored in deployed-state.
 * 4. If changed (or first deploy): remove all existing examples, then add the
 *    new ones from the source file.
 * 5. Persist the new hash back to deployed-state.
 */
import type { Dataset } from '../../../schema';
import type { DatasetDeployedState } from '../../../schema/schemas/deployed-state';
import { addDatasetExamples, listAllDatasetExamples, removeDatasetExamples } from '../../aws/agentcore-datasets';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface SyncDatasetSourcesOptions {
  region: string;
  /**
   * Dataset specs from agentcore.json.
   * Only datasets with a `source` field are processed.
   */
  datasetSpecs: Dataset[];
  /**
   * Deployed dataset state from deployed-state.json.
   * Used to look up datasetId and the previously stored sourceHash.
   */
  deployedDatasets: Record<string, DatasetDeployedState>;
  /**
   * Base directory for resolving relative `source` paths (typically the
   * agentcore config root, i.e. the directory containing agentcore.json).
   */
  configBaseDir: string;
}

export interface DatasetSyncResult {
  datasetName: string;
  status: 'synced' | 'skipped' | 'no_deployed_state' | 'error';
  /** New hash after a successful sync (undefined when skipped or errored). */
  newHash?: string;
  error?: string;
}

export interface SyncDatasetSourcesResult {
  results: DatasetSyncResult[];
  /**
   * Updated dataset deployed state entries.
   * Only includes datasets that have a deployed state (with or without source).
   * Callers should merge this over the existing deployed-state datasets map.
   */
  updatedDatasets: Record<string, DatasetDeployedState>;
  hasErrors: boolean;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Sync source files for all datasets that have a `source` field and whose
 * content has changed since the last deploy.
 */
export async function syncDatasetSources(options: SyncDatasetSourcesOptions): Promise<SyncDatasetSourcesResult> {
  const { region, datasetSpecs, deployedDatasets, configBaseDir } = options;
  const results: DatasetSyncResult[] = [];
  const updatedDatasets: Record<string, DatasetDeployedState> = { ...deployedDatasets };

  for (const spec of datasetSpecs) {
    // Only process datasets with a source file
    if (!spec.source) {
      results.push({ datasetName: spec.name, status: 'skipped' });
      continue;
    }

    const deployedState = deployedDatasets[spec.name];
    if (!deployedState) {
      results.push({
        datasetName: spec.name,
        status: 'no_deployed_state',
        error: `Dataset "${spec.name}" has no deployed state — it may not have deployed successfully`,
      });
      continue;
    }

    try {
      // Read source file and compute hash
      const sourcePath = resolve(configBaseDir, spec.source);
      const sourceContent = await readFile(sourcePath, 'utf8');
      const newHash = createHash('sha256').update(sourceContent).digest('hex');

      // Skip if unchanged
      if (deployedState.sourceHash === newHash) {
        results.push({ datasetName: spec.name, status: 'skipped' });
        continue;
      }

      // Parse source file: each non-empty line is a JSON object (JSONL)
      const examples = parseSourceFile(sourceContent, spec.source);

      // Remove all existing examples before adding new ones
      const existing = await listAllDatasetExamples({ region, datasetId: deployedState.datasetId });
      if (existing.length > 0) {
        await removeDatasetExamples({
          region,
          datasetId: deployedState.datasetId,
          exampleIds: existing.map(e => e.exampleId),
        });
      }

      // Add new examples
      if (examples.length > 0) {
        await addDatasetExamples({
          region,
          datasetId: deployedState.datasetId,
          examples,
        });
      }

      // Persist new hash in updated state
      updatedDatasets[spec.name] = { ...deployedState, sourceHash: newHash };
      results.push({ datasetName: spec.name, status: 'synced', newHash });
    } catch (err) {
      results.push({
        datasetName: spec.name,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    results,
    updatedDatasets,
    hasErrors: results.some(r => r.status === 'error'),
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a dataset source file into an array of JSON objects.
 *
 * Supports two formats:
 * - JSONL (one JSON object per line, blank lines ignored)
 * - JSON array (top-level array of objects)
 */
function parseSourceFile(content: string, filePath: string): Record<string, unknown>[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // Try JSON array first
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error(`Source file "${filePath}" top-level JSON must be an array`);
      }
      return parsed as Record<string, unknown>[];
    } catch (err) {
      throw new Error(
        `Source file "${filePath}" is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Treat as JSONL
  const lines = trimmed.split('\n').filter(line => line.trim() !== '');
  const examples: Record<string, unknown>[] = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      examples.push(JSON.parse(lines[i]!) as Record<string, unknown>);
    } catch (err) {
      throw new Error(
        `Source file "${filePath}" line ${i + 1} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return examples;
}
