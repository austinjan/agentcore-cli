/**
 * Discriminated union for fallible operations, inspired by Rust's Result<T, E>.
 *
 * Success branch spreads T onto the result; failure branch carries an Error.
 * E extends Error so callers always get stack traces, cause chains, and instanceof narrowing.
 *
 * @example
 *   Result                                    // { success: true } | { success: false; error: Error }
 *   Result<{ name: string }>                  // { success: true; name: string } | { success: false; error: Error }
 *   Result<{ name: string }, ValidationError> // { success: true; name: string } | { success: false; error: ValidationError }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Result<T extends Record<string, unknown> = {}, E extends Error = Error> =
  | ({ success: true } & T)
  | { success: false; error: E };

/** Serialize a Result for JSON output, converting error to its message string. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resultToJson(result: { success: boolean; error?: Error } & Record<string, any>): string {
  if (!result.success && result.error) {
    const { error, ...rest } = result;
    const serialized: Record<string, unknown> = {
      ...rest,
      error: error.message,
      errorType: error.name,
    };
    // Preserve structured data from custom error classes
    if ('errors' in error && Array.isArray(error.errors)) {
      serialized.errors = error.errors;
    }
    if (error.cause instanceof Error) {
      serialized.cause = error.cause.message;
    }
    return JSON.stringify(serialized);
  }
  return JSON.stringify(result);
}
