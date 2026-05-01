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
 * Dataset configuration.
 */
export const DatasetSchema = z.object({
  /** Dataset name */
  name: DatasetNameSchema,
  /** Optional description */
  description: z.string().optional(),
});

export type Dataset = z.infer<typeof DatasetSchema>;
