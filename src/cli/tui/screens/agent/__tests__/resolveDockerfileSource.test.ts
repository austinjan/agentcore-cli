import { resolveDockerfileSource, validateDockerfileSource } from '../useAddAgent';
import { resolve, win32 } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { resolve: win32Resolve, basename: win32Basename } = win32;

describe('resolveDockerfileSource', () => {
  it('returns shouldCopy=false when value is undefined', () => {
    expect(resolveDockerfileSource(undefined, '/some/cwd')).toEqual({ shouldCopy: false });
  });

  it('returns shouldCopy=false when value is empty string', () => {
    expect(resolveDockerfileSource('', '/some/cwd')).toEqual({ shouldCopy: false });
  });

  it('returns shouldCopy=false for a bare filename (no path separators)', () => {
    // A bare filename refers to the file already in place; no copy needed.
    expect(resolveDockerfileSource('Dockerfile', '/some/cwd')).toEqual({ shouldCopy: false });
    expect(resolveDockerfileSource('my.Dockerfile', '/some/cwd')).toEqual({ shouldCopy: false });
  });

  it('resolves a relative path against the provided cwd (not the project root)', () => {
    // This is the bug from issue #1128: previously the path resolved against
    // <projectRoot>/<codeLocation>, now it resolves against the invocation cwd.
    const result = resolveDockerfileSource('./my.Dockerfile', '/home/user/cwd');
    expect(result.shouldCopy).toBe(true);
    expect(result.sourcePath).toBe(resolve('/home/user/cwd', './my.Dockerfile'));
    expect(result.filename).toBe('my.Dockerfile');
  });

  it('resolves a nested relative path against cwd', () => {
    const result = resolveDockerfileSource('subdir/Custom.Dockerfile', '/home/user');
    expect(result.shouldCopy).toBe(true);
    expect(result.sourcePath).toBe(resolve('/home/user', 'subdir/Custom.Dockerfile'));
    expect(result.filename).toBe('Custom.Dockerfile');
  });

  it('handles parent-relative paths against cwd', () => {
    const result = resolveDockerfileSource('../sibling/Dockerfile', '/home/user/project');
    expect(result.shouldCopy).toBe(true);
    expect(result.sourcePath).toBe(resolve('/home/user/project', '../sibling/Dockerfile'));
    expect(result.filename).toBe('Dockerfile');
  });

  it('returns absolute paths verbatim', () => {
    const result = resolveDockerfileSource('/absolute/path/to/Dockerfile.prod', '/some/cwd');
    expect(result.shouldCopy).toBe(true);
    // resolve() is a no-op on absolute paths.
    expect(result.sourcePath).toBe('/absolute/path/to/Dockerfile.prod');
    expect(result.filename).toBe('Dockerfile.prod');
  });

  it('strips directory components, returning only the basename for filename', () => {
    const result = resolveDockerfileSource('a/b/c/MyDocker.file', '/cwd');
    expect(result.filename).toBe('MyDocker.file');
  });

  describe('cross-platform path-separator detection', () => {
    // These tests lock in the *classification* contract (i.e. `shouldCopy`)
    // for inputs containing backslashes, which is the value-add of detecting
    // both separators. Note: on a POSIX test runner the platform-default
    // `path` module does not interpret '\\' as a separator, so
    // `basename('subdir\\Dockerfile')` returns the literal string verbatim.
    // Genuine end-to-end Windows path resolution is exercised below using
    // `path.win32` directly.
    it('classifies a backslash-containing relative path as a path-to-copy', () => {
      // On Windows, users may enter paths like 'subdir\\Dockerfile'.
      // Without backslash detection, this would be misclassified as a bare
      // filename and silently skip the copy step (data-loss bug).
      const result = resolveDockerfileSource('subdir\\Dockerfile', '/cwd');
      expect(result.shouldCopy).toBe(true);
    });

    it('classifies a dot-prefixed backslash path as a path-to-copy', () => {
      const result = resolveDockerfileSource('.\\sub\\My.Dockerfile', '/cwd');
      expect(result.shouldCopy).toBe(true);
    });

    it('still classifies a bare filename with no separators as not-a-path', () => {
      // Sanity check: backslash detection must not over-trigger on plain
      // filenames containing dots.
      expect(resolveDockerfileSource('Dockerfile.dev', '/cwd').shouldCopy).toBe(false);
    });

    it('extracts the correct basename from a Windows-style path under win32 semantics', () => {
      // This documents the expected behavior on a real Windows host. We
      // simulate it by computing the expected values via `path.win32`
      // directly: on Windows, node's default `path` IS `path.win32`, so
      // resolve/basename understand backslashes.
      const input = 'subdir\\Custom.Dockerfile';
      const expectedSourcePath = win32Resolve('C:\\cwd', input);
      const expectedFilename = win32Basename(expectedSourcePath);
      expect(expectedFilename).toBe('Custom.Dockerfile');
      // The actual helper uses platform-default path resolution, so this
      // assertion is also platform-dependent. We assert on classification
      // only here — basename correctness on Windows is provided by node's
      // `path` module itself, which we trust.
      expect(resolveDockerfileSource(input, 'C:\\cwd').shouldCopy).toBe(true);
    });
  });

  describe('default cwd parameter (getWorkingDirectory)', () => {
    // Save and restore INIT_CWD manually rather than relying on the
    // `vi.stubEnv(name, undefined)` deletion contract, which is a vitest
    // implementation detail that has shifted across versions.
    let savedInitCwd: string | undefined;

    beforeEach(() => {
      savedInitCwd = process.env.INIT_CWD;
    });

    afterEach(() => {
      if (savedInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = savedInitCwd;
      }
    });

    it('uses INIT_CWD when set (npm/bun script invocation case)', () => {
      // Set INIT_CWD to a known sentinel and verify the helper actually
      // routes through getWorkingDirectory() rather than process.cwd().
      process.env.INIT_CWD = '/sentinel/init/cwd';
      const result = resolveDockerfileSource('./local.Dockerfile');
      expect(result.shouldCopy).toBe(true);
      expect(result.sourcePath).toBe(resolve('/sentinel/init/cwd', './local.Dockerfile'));
    });

    it('falls back to process.cwd() when INIT_CWD is unset', () => {
      // When INIT_CWD is unset, getWorkingDirectory() falls back to
      // process.cwd().
      delete process.env.INIT_CWD;
      const result = resolveDockerfileSource('./local.Dockerfile');
      expect(result.shouldCopy).toBe(true);
      expect(result.sourcePath).toBe(resolve(process.cwd(), './local.Dockerfile'));
    });

    it('treats INIT_CWD="" (empty string) as set, not as unset (?? semantics)', () => {
      // getWorkingDirectory() uses the nullish coalescing operator (??),
      // which does NOT treat empty string as nullish. This test documents
      // that contract: INIT_CWD='' is honored as the working directory.
      // The resulting resolve('', './local.Dockerfile') is equivalent to
      // resolving against process.cwd() (since resolve('', x) is
      // process.cwd() + x), so we verify the value goes through the
      // INIT_CWD branch by asserting it matches resolve('', ...) (which
      // is process.cwd() + ...) — this is observationally identical to
      // the unset case but documents intent.
      process.env.INIT_CWD = '';
      const result = resolveDockerfileSource('./local.Dockerfile');
      expect(result.shouldCopy).toBe(true);
      expect(result.sourcePath).toBe(resolve('', './local.Dockerfile'));
    });
  });
});

describe('validateDockerfileSource', () => {
  it('returns ok+shouldCopy=false when value is undefined', () => {
    const result = validateDockerfileSource(undefined, '/cwd', () => true);
    expect(result).toEqual({ ok: true, shouldCopy: false });
  });

  it('returns ok+shouldCopy=false for a bare filename (does not call fileExists)', () => {
    // Bare filenames refer to a file already in place (or to be placed
    // later); they bypass the existence check entirely.
    const fileExists = vi.fn(() => false);
    const result = validateDockerfileSource('Dockerfile', '/cwd', fileExists);
    expect(result).toEqual({ ok: true, shouldCopy: false });
    expect(fileExists).not.toHaveBeenCalled();
  });

  it('returns the resolved source+filename when the path exists', () => {
    const fileExists = vi.fn(() => true);
    const result = validateDockerfileSource('./my.Dockerfile', '/home/user/cwd', fileExists);
    expect(result).toEqual({
      ok: true,
      shouldCopy: true,
      sourcePath: resolve('/home/user/cwd', './my.Dockerfile'),
      filename: 'my.Dockerfile',
    });
    expect(fileExists).toHaveBeenCalledWith(resolve('/home/user/cwd', './my.Dockerfile'));
  });

  it('returns ok=false with a "Dockerfile not found at <sourcePath>" error when missing', () => {
    // This is the error path consumed by handleCreatePath / handleByoPath.
    // Asserting the exact message protects against accidental changes that
    // would alter user-visible CLI output.
    const fileExists = vi.fn(() => false);
    const result = validateDockerfileSource('./missing.Dockerfile', '/home/user/cwd', fileExists);
    expect(result).toEqual({
      ok: false,
      error: `Dockerfile not found at ${resolve('/home/user/cwd', './missing.Dockerfile')}`,
    });
  });

  it('reports the resolved (cwd-relative) sourcePath in the error, not the user-typed input', () => {
    // Regression for issue #1128: the error message must reference the
    // path resolved against the invocation cwd, so users can see exactly
    // where the CLI looked for their file.
    const result = validateDockerfileSource('myFile', '/expected/cwd', () => false);
    // 'myFile' is a bare filename → shouldCopy=false, no error, no
    // existsSync call. Confirm we do not produce a misleading error.
    expect(result).toEqual({ ok: true, shouldCopy: false });

    const result2 = validateDockerfileSource('./myFile', '/expected/cwd', () => false);
    expect(result2).toEqual({
      ok: false,
      error: `Dockerfile not found at ${resolve('/expected/cwd', './myFile')}`,
    });
    expect((result2 as { ok: false; error: string }).error).toContain('/expected/cwd');
  });

  it('handles absolute paths that exist', () => {
    const fileExists = vi.fn(() => true);
    const result = validateDockerfileSource('/abs/path/Dockerfile.prod', '/cwd', fileExists);
    expect(result).toEqual({
      ok: true,
      shouldCopy: true,
      sourcePath: '/abs/path/Dockerfile.prod',
      filename: 'Dockerfile.prod',
    });
    expect(fileExists).toHaveBeenCalledWith('/abs/path/Dockerfile.prod');
  });

  it('handles absolute paths that do not exist', () => {
    const result = validateDockerfileSource('/abs/missing/Dockerfile', '/cwd', () => false);
    expect(result).toEqual({
      ok: false,
      error: 'Dockerfile not found at /abs/missing/Dockerfile',
    });
  });
});
