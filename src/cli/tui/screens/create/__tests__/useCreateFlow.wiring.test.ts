import { readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the field wiring from AddHarnessConfig → harnessPrimitive.add in
 * useCreateFlow.ts. Prevents regressions of the useCreateFlow.ts:497 class of bug
 * (config field silently dropped because the caller used an old field name).
 *
 * This is a source-level assertion (grepping the file) rather than a runtime test
 * because useCreateFlow is deeply wired to react state and TUI components; the
 * wiring itself is simple enough that a static assertion catches real regressions
 * without the overhead of a full render harness.
 */
describe('useCreateFlow harness wiring', () => {
  const filePath = join(__dirname, '..', 'useCreateFlow.ts');

  it('passes apiKey (not apiKeyArn) from AddHarnessConfig to harnessPrimitive.add', async () => {
    const source = await readFile(filePath, 'utf-8');
    expect(source).toMatch(/apiKey:\s*addHarnessConfig\.apiKey\b/);
    // Must not contain the old broken field name
    expect(source).not.toMatch(/apiKeyArn:\s*addHarnessConfig\.apiKeyArn/);
  });

  it('does not reference removed AddHarnessConfig.apiKeyArn field', async () => {
    const source = await readFile(filePath, 'utf-8');
    expect(source).not.toMatch(/addHarnessConfig\.apiKeyArn/);
  });
});
