import { getWorkingDirectory } from '../../../../lib';
import { copyFileSync, existsSync } from 'fs';
import { basename, isAbsolute, join, resolve } from 'path';

/**
 * Resolve a user-supplied Dockerfile path against the directory where the user
 * invoked the CLI (i.e. `getWorkingDirectory()` — `INIT_CWD` or `process.cwd()`),
 * validate that the file exists, and copy it into `destDir`.
 *
 * Returns the basename of the copied Dockerfile, which is what should be stored
 * in the agent spec (since the Dockerfile is now colocated with the agent code).
 *
 * Throws an `Error` with a user-friendly message (including the resolved
 * absolute path) if the source file does not exist.
 *
 * Note: callers should only invoke this when the user-supplied path actually
 * looks like a path (e.g. contains a path separator or is absolute). If the
 * value is just a bare filename, it should be left alone — the convention is
 * that bare filenames already live in the agent code directory.
 */
export function resolveAndCopyDockerfile(userPath: string, destDir: string): string {
  const baseDir = getWorkingDirectory();
  const sourcePath = isAbsolute(userPath) ? userPath : resolve(baseDir, userPath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Dockerfile not found at ${sourcePath}`);
  }
  const filename = basename(sourcePath);
  copyFileSync(sourcePath, join(destDir, filename));
  return filename;
}

/**
 * Returns true if the user-supplied dockerfile string represents a path
 * (relative with separators, or absolute) rather than a bare filename
 * already in the agent code directory.
 */
export function isDockerfilePath(value: string): boolean {
  return value.includes('/') || value.includes('\\') || isAbsolute(value);
}
