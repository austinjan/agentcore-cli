import type { Result } from '../result';
import { describe, expectTypeOf, it } from 'vitest';

describe('Result type', () => {
  it('Result narrows correctly on success', () => {
    const result: Result<{ name: string }> = { success: true, name: 'test' };
    if (result.success) {
      expectTypeOf(result.name).toBeString();
    }
  });

  it('Result narrows correctly on failure', () => {
    const result: Result<{ name: string }> = { success: false, error: new Error('fail') };
    if (!result.success) {
      expectTypeOf(result.error).toEqualTypeOf<Error>();
    }
  });
});
