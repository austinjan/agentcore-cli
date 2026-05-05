import type { Result } from '../../../lib/result';

export interface DeployOptions {
  target?: string;
  yes?: boolean;
  progress?: boolean;
  verbose?: boolean;
  json?: boolean;
  plan?: boolean;
  diff?: boolean;
}

export type DeployResult =
  | {
      success: true;
      targetName?: string;
      stackName?: string;
      outputs?: Record<string, string>;
      logPath?: string;
      nextSteps?: string[];
      notes?: string[];
      postDeployWarnings?: string[];
    }
  | { success: false; error: Error; logPath?: string };

export type PreflightResult = Result<{
  stackNames?: string[];
  needsBootstrap?: boolean;
}>;
