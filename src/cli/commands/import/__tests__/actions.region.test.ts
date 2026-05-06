/**
 * Regression test for issue #924: handleImport must not leak
 * AWS_REGION / AWS_DEFAULT_REGION environment mutations on early returns,
 * exceptions, or successful completion.
 *
 * The historical bug was that import/actions.ts unconditionally assigned
 *   process.env.AWS_REGION = parsed.awsTarget.region
 * with no restore path — so a `agentcore import` invocation would silently
 * change the user's region for every subsequent CLI call in the same shell
 * session. The fix promotes the override through applyTargetRegionToEnv +
 * try/finally so any AWS_REGION/AWS_DEFAULT_REGION values present before the
 * import are restored after it returns or throws.
 */
import { handleImport } from '../actions';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('handleImport — AWS_REGION/AWS_DEFAULT_REGION restore (issue #924)', () => {
  let savedRegion: string | undefined;
  let savedDefaultRegion: string | undefined;
  let originalCwd: string;

  beforeEach(() => {
    savedRegion = process.env.AWS_REGION;
    savedDefaultRegion = process.env.AWS_DEFAULT_REGION;
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (savedRegion !== undefined) process.env.AWS_REGION = savedRegion;
    else delete process.env.AWS_REGION;
    if (savedDefaultRegion !== undefined) process.env.AWS_DEFAULT_REGION = savedDefaultRegion;
    else delete process.env.AWS_DEFAULT_REGION;
  });

  it('returns gracefully and leaves AWS_REGION untouched when not in an agentcore project', async () => {
    // Run from a tmp dir with no agentcore project: handleImport should hit
    // the early "No agentcore project found" return BEFORE any env mutation.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handleimport-noproj-'));
    process.chdir(tmpDir);

    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;

    const result = await handleImport({ source: '/nonexistent/file.yaml' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No agentcore project found/);
    expect(process.env.AWS_REGION).toBeUndefined();
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves a pre-existing AWS_REGION across an early-return failure', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handleimport-noproj-'));
    process.chdir(tmpDir);

    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEFAULT_REGION = 'us-east-1';

    const result = await handleImport({ source: '/nonexistent/file.yaml' });

    expect(result.success).toBe(false);
    expect(process.env.AWS_REGION).toBe('us-east-1');
    expect(process.env.AWS_DEFAULT_REGION).toBe('us-east-1');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
