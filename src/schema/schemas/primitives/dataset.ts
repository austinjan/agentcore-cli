import { z } from 'zod';

// ============================================================================
// Dataset Types
// ============================================================================

/**
 * Dataset name validation.
 * Pattern: ^[a-zA-Z][a-zA-Z0-9_]{0,47}$
 */
export const DatasetNameSchema = z
  .string()
  .min(1, 'Dataset name is required')
  .max(48)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/,
    'Must begin with a letter and contain only alphanumeric characters and underscores (max 48 chars)'
  );

/**
 * Versioned schema type governing the structure of dataset examples.
 * Immutable after creation (createOnly CFN property).
 */
export const DatasetSchemaTypeSchema = z.enum([
  'AGENTCORE_EVALUATION_PREDEFINED_V1',
  'AGENTCORE_EVALUATION_SIMULATED_V1',
  'STRANDS_EXPERIMENT_V1',
  'LANGSMITH_V1',
  'DEEP_EVAL_V1',
  'ARIZE_PHOENIX_V1',
  'RAGAS_V1',
]);

export type DatasetSchemaType = z.infer<typeof DatasetSchemaTypeSchema>;

/**
 * Dataset configuration.
 */
export const DatasetSchema = z.object({
  /** Dataset name */
  name: DatasetNameSchema,
  /**
   * Versioned schema type governing dataset structure.
   * Immutable after creation.
   */
  schemaType: DatasetSchemaTypeSchema,
  /** Optional description */
  description: z.string().optional(),
  /**
   * Local file path to the dataset source file.
   * Used by the CLI to upload dataset content at deploy time.
   */
  source: z.string().optional(),
});

export type Dataset = z.infer<typeof DatasetSchema>;
