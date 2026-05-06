import { isDockerfilePath, resolveAndCopyDockerfile } from '../dockerfile-utils';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('dockerfile-utils', () => {
  describe('isDockerfilePath', () => {
    it('returns true for POSIX paths', () => {
      expect(isDockerfilePath('./Dockerfile')).toBe(true);
      expect(isDockerfilePath('./sub/Dockerfile')).toBe(true);
      expect(isDockerfilePath('../Dockerfile')).toBe(true);
      expect(isDockerfilePath('/abs/path/Dockerfile')).toBe(true);
    });

    it('returns true for Windows-style paths', () => {
      expect(isDockerfilePath('sub\\Dockerfile')).toBe(true);
    });

    it('returns false for bare filenames', () => {
      expect(isDockerfilePath('Dockerfile')).toBe(false);
      expect(isDockerfilePath('Dockerfile.gpu')).toBe(false);
    });
  });

  describe('resolveAndCopyDockerfile', () => {
    let userCwd: string;
    let destDir: string;
    const originalCwd = process.cwd();
    const originalInitCwd = process.env.INIT_CWD;

    beforeEach(() => {
      userCwd = mkdtempSync(join(tmpdir(), 'dockerfile-cwd-'));
      destDir = mkdtempSync(join(tmpdir(), 'dockerfile-dest-'));
      // Simulate the user invoking the CLI from `userCwd` regardless of where
      // the test runner happens to be running.
      process.env.INIT_CWD = userCwd;
    });

    afterEach(() => {
      process.chdir(originalCwd);
      if (originalInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = originalInitCwd;
      }
      rmSync(userCwd, { recursive: true, force: true });
      rmSync(destDir, { recursive: true, force: true });
    });

    it('resolves a relative path against the user invocation CWD (not the destDir)', () => {
      // Create the file in the user's CWD, NOT in destDir or its parent.
      const userFile = join(userCwd, 'My.Dockerfile');
      writeFileSync(userFile, 'FROM python:3.12\n');

      const filename = resolveAndCopyDockerfile('./My.Dockerfile', destDir);

      expect(filename).toBe('My.Dockerfile');
      expect(readFileSync(join(destDir, 'My.Dockerfile'), 'utf-8')).toBe('FROM python:3.12\n');
    });

    it('handles nested relative paths', () => {
      const subdir = join(userCwd, 'docker');
      mkdirSync(subdir, { recursive: true });
      const userFile = join(subdir, 'My.Dockerfile');
      writeFileSync(userFile, 'FROM node:20\n');

      const filename = resolveAndCopyDockerfile(`./docker${sep}My.Dockerfile`, destDir);

      expect(filename).toBe('My.Dockerfile');
      expect(readFileSync(join(destDir, 'My.Dockerfile'), 'utf-8')).toBe('FROM node:20\n');
    });

    it('passes through absolute paths unchanged', () => {
      const otherDir = mkdtempSync(join(tmpdir(), 'dockerfile-abs-'));
      try {
        const absFile = join(otherDir, 'Abs.Dockerfile');
        writeFileSync(absFile, 'FROM scratch\n');

        const filename = resolveAndCopyDockerfile(absFile, destDir);

        expect(filename).toBe('Abs.Dockerfile');
        expect(readFileSync(join(destDir, 'Abs.Dockerfile'), 'utf-8')).toBe('FROM scratch\n');
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it('throws a helpful error when the source file does not exist, including the resolved CWD path', () => {
      expect(() => resolveAndCopyDockerfile('./missing.Dockerfile', destDir)).toThrow(
        /Dockerfile not found at .*missing\.Dockerfile/
      );

      // The resolved error path must point under the user's CWD (regression for #1128:
      // it previously pointed under the project root, e.g. .../<project>/missing.Dockerfile).
      try {
        resolveAndCopyDockerfile('./missing.Dockerfile', destDir);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toContain(userCwd);
        expect((err as Error).message).not.toContain(destDir);
      }
    });

    it('falls back to process.cwd() when INIT_CWD is unset', () => {
      delete process.env.INIT_CWD;
      process.chdir(userCwd);

      const userFile = join(userCwd, 'Cwd.Dockerfile');
      writeFileSync(userFile, 'FROM alpine\n');

      const filename = resolveAndCopyDockerfile('./Cwd.Dockerfile', destDir);

      expect(filename).toBe('Cwd.Dockerfile');
      expect(readFileSync(join(destDir, 'Cwd.Dockerfile'), 'utf-8')).toBe('FROM alpine\n');
    });
  });
});
