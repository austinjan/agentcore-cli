import { resolveDockerfileSource } from '../useAddAgent';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('resolveDockerfileSource', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    it('treats backslash-containing relative paths as paths, not bare filenames', () => {
      // On Windows, users may enter paths like 'subdir\\Dockerfile'.
      // Without backslash detection, this would be misclassified as a bare
      // filename and silently skip the copy step (data-loss bug).
      const result = resolveDockerfileSource('subdir\\Dockerfile', '/cwd');
      expect(result.shouldCopy).toBe(true);
    });

    it('treats dot-prefixed backslash paths as paths', () => {
      const result = resolveDockerfileSource('.\\sub\\My.Dockerfile', '/cwd');
      expect(result.shouldCopy).toBe(true);
    });

    it('still treats a bare filename with no separators as not-a-path', () => {
      // Sanity check: backslash detection must not over-trigger on plain
      // filenames containing dots.
      expect(resolveDockerfileSource('Dockerfile.dev', '/cwd').shouldCopy).toBe(false);
    });
  });

  describe('default cwd parameter (getWorkingDirectory)', () => {
    it('uses INIT_CWD when set (npm/bun script invocation case)', () => {
      // Stub INIT_CWD to a known sentinel and verify the helper actually
      // routes through getWorkingDirectory() rather than process.cwd().
      vi.stubEnv('INIT_CWD', '/sentinel/init/cwd');
      const result = resolveDockerfileSource('./local.Dockerfile');
      expect(result.shouldCopy).toBe(true);
      expect(result.sourcePath).toBe(resolve('/sentinel/init/cwd', './local.Dockerfile'));
    });

    it('falls back to process.cwd() when INIT_CWD is unset', () => {
      // When INIT_CWD is unset, getWorkingDirectory() falls back to
      // process.cwd(). vi.stubEnv with undefined deletes the variable.
      vi.stubEnv('INIT_CWD', undefined as unknown as string);
      const result = resolveDockerfileSource('./local.Dockerfile');
      expect(result.shouldCopy).toBe(true);
      expect(result.sourcePath).toBe(resolve(process.cwd(), './local.Dockerfile'));
    });
  });
});
