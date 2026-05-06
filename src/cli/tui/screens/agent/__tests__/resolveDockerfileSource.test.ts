import { resolveDockerfileSource } from '../useAddAgent';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

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

  it('uses getWorkingDirectory() by default when no cwd is provided', () => {
    // The default parameter should call getWorkingDirectory(), which falls back
    // to process.cwd() when INIT_CWD is unset. We assert the resolved path
    // matches resolution against process.cwd().
    const result = resolveDockerfileSource('./local.Dockerfile');
    expect(result.shouldCopy).toBe(true);
    expect(result.sourcePath).toBe(resolve(process.env.INIT_CWD ?? process.cwd(), './local.Dockerfile'));
  });
});
