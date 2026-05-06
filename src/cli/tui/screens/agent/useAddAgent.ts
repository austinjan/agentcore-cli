import { APP_DIR, ConfigIO, NoProjectError, findConfigRoot, getWorkingDirectory, setEnvVar } from '../../../../lib';
import type { AgentEnvSpec, DirectoryPath, FilePath } from '../../../../schema';
import { type PythonSetupResult, setupPythonProject } from '../../../operations';
import { createConfigBundleForAgent } from '../../../operations/agent/config-bundle-defaults';
import {
  mapGenerateConfigToRenderConfig,
  mapModelProviderToCredentials,
  mapModelProviderToIdentityProviders,
  writeAgentToProject,
} from '../../../operations/agent/generate';
import { executeImportAgent } from '../../../operations/agent/import';
import { buildAuthorizerConfigFromJwtConfig, createManagedOAuthCredential } from '../../../primitives/auth-utils';
import { computeDefaultCredentialEnvVarName } from '../../../primitives/credential-utils';
import { credentialPrimitive } from '../../../primitives/registry';
import { withAddTelemetry } from '../../../telemetry/cli-command-run.js';
import {
  AgentType as AgentTypeEnum,
  AuthorizerType as AuthorizerTypeEnum,
  Build,
  Framework,
  Language,
  Memory as MemoryEnum,
  ModelProvider,
  NetworkMode,
  Protocol,
  standardize,
} from '../../../telemetry/schemas/common-shapes.js';
import { createRenderer } from '../../../templates';
import type { GenerateConfig } from '../generate/types';
import type { AddAgentConfig } from './types';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { basename, dirname, isAbsolute, join, resolve } from 'path';
import { useCallback, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AddAgentCreateResult {
  ok: true;
  type: 'create';
  agentName: string;
  projectName: string;
  projectPath: string;
  pythonSetupResult?: PythonSetupResult;
}

export interface AddAgentByoResult {
  ok: true;
  type: 'byo';
  agentName: string;
  projectName: string;
}

export interface AddAgentError {
  ok: false;
  error: string;
}

export type AddAgentOutcome = AddAgentCreateResult | AddAgentByoResult | AddAgentError;

// ─────────────────────────────────────────────────────────────────────────────
// Config Mappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of resolving a user-entered Dockerfile path.
 *
 * - When `value` is empty/undefined or a bare filename (no path separators),
 *   we return `{ shouldCopy: false }` and the caller should leave the existing
 *   dockerfile untouched (template default or already-in-place file).
 * - When `value` is a relative or absolute path, we resolve it against the
 *   user's invocation directory (`getWorkingDirectory()`), mirroring the
 *   `agentcore policy add --source <path>` pattern. The returned `sourcePath`
 *   is the absolute path to copy from, and `filename` is the basename to
 *   persist into the agent spec and copy into the agent code directory.
 */
export interface ResolvedDockerfile {
  shouldCopy: boolean;
  sourcePath?: string;
  filename?: string;
}

export function resolveDockerfileSource(
  value: string | undefined,
  cwd: string = getWorkingDirectory()
): ResolvedDockerfile {
  if (!value) {
    return { shouldCopy: false };
  }
  // Only treat as a path-to-copy when it contains a path separator or is
  // absolute. A bare filename (e.g. "Dockerfile") refers to the file already
  // in place and should not trigger a copy. Detect both forward and
  // backslash separators so users on Windows entering paths like
  // 'subdir\\Dockerfile' aren't silently misclassified as bare filenames.
  if (!isAbsolute(value) && !/[/\\]/.test(value)) {
    return { shouldCopy: false };
  }
  const sourcePath = resolve(cwd, value);
  return {
    shouldCopy: true,
    sourcePath,
    filename: basename(sourcePath),
  };
}

/**
 * Maps AddAgentConfig (from BYO wizard) to v2 AgentEnvSpec for schema persistence.
 */
export function mapByoConfigToAgent(config: AddAgentConfig): AgentEnvSpec {
  const networkMode = config.networkMode ?? 'PUBLIC';
  return {
    name: config.name,
    build: config.buildType,
    ...(config.dockerfile && { dockerfile: config.dockerfile }),
    entrypoint: config.entrypoint as FilePath,
    codeLocation: config.codeLocation as DirectoryPath,
    runtimeVersion: config.pythonVersion,
    protocol: config.protocol ?? 'HTTP',
    networkMode,
    ...(networkMode === 'VPC' &&
      config.subnets &&
      config.securityGroups && {
        networkConfig: {
          subnets: config.subnets,
          securityGroups: config.securityGroups,
        },
      }),
    ...(config.requestHeaderAllowlist?.length && {
      requestHeaderAllowlist: config.requestHeaderAllowlist,
    }),
    ...(config.authorizerType && { authorizerType: config.authorizerType }),
    ...(config.authorizerType === 'CUSTOM_JWT' &&
      config.jwtConfig && {
        authorizerConfiguration: buildAuthorizerConfigFromJwtConfig(config.jwtConfig),
      }),
    ...(config.idleRuntimeSessionTimeout !== undefined || config.maxLifetime !== undefined
      ? {
          lifecycleConfiguration: {
            ...(config.idleRuntimeSessionTimeout !== undefined && {
              idleRuntimeSessionTimeout: config.idleRuntimeSessionTimeout,
            }),
            ...(config.maxLifetime !== undefined && { maxLifetime: config.maxLifetime }),
          },
        }
      : {}),
    ...(config.sessionStorageMountPath && {
      filesystemConfigurations: [{ sessionStorage: { mountPath: config.sessionStorageMountPath } }],
    }),
  };
}

/**
 * Maps AddAgentConfig to GenerateConfig for the create path.
 */
function mapAddAgentConfigToGenerateConfig(config: AddAgentConfig): GenerateConfig {
  return {
    projectName: config.name, // In create context, this is the agent name
    buildType: config.buildType,
    ...(config.dockerfile && { dockerfile: config.dockerfile }),
    protocol: config.protocol,
    sdk: config.framework,
    modelProvider: config.modelProvider,
    memory: config.memory,
    language: config.language,
    networkMode: config.networkMode,
    subnets: config.subnets,
    securityGroups: config.securityGroups,
    requestHeaderAllowlist: config.requestHeaderAllowlist,
    authorizerType: config.authorizerType,
    jwtConfig: config.jwtConfig,
    idleRuntimeSessionTimeout: config.idleRuntimeSessionTimeout,
    maxLifetime: config.maxLifetime,
    sessionStorageMountPath: config.sessionStorageMountPath,
    withConfigBundle: config.withConfigBundle,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook to add an agent to the project.
 * Supports both "create" (generate from template) and "byo" (bring your own code) paths.
 */
export function useAddAgent() {
  const [isLoading, setIsLoading] = useState(false);

  const addAgent = useCallback(async (config: AddAgentConfig): Promise<AddAgentOutcome> => {
    setIsLoading(true);
    try {
      const result = await withAddTelemetry(
        'add.agent',
        {
          language: standardize(Language, config.language),
          framework: standardize(Framework, config.framework),
          model_provider: standardize(ModelProvider, config.modelProvider),
          agent_type: standardize(AgentTypeEnum, config.agentType),
          build: standardize(Build, config.buildType),
          protocol: standardize(Protocol, config.protocol ?? 'HTTP'),
          network_mode: standardize(NetworkMode, config.networkMode ?? 'PUBLIC'),
          authorizer_type: standardize(AuthorizerTypeEnum, config.authorizerType ?? 'NONE'),
          memory: standardize(MemoryEnum, config.memory ?? 'none'),
        },
        () => addAgentInner(config)
      );
      if (!result.success) {
        return { ok: false, error: result.error };
      }
      return result.outcome;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setIsLoading(false);
  }, []);

  return { addAgent, isLoading, reset };
}

type AddAgentInnerResult =
  | { success: true; outcome: AddAgentCreateResult | AddAgentByoResult }
  | { success: false; error: string };

async function addAgentInner(config: AddAgentConfig): Promise<AddAgentInnerResult> {
  const configBaseDir = findConfigRoot();
  if (!configBaseDir) {
    return { success: false, error: new NoProjectError().message };
  }

  const configIO = new ConfigIO({ baseDir: configBaseDir });

  if (!configIO.configExists('project')) {
    return { success: false, error: new NoProjectError().message };
  }

  const project = await configIO.readProjectSpec();
  const existingAgent = project.runtimes.find(agent => agent.name === config.name);
  if (existingAgent) {
    return { success: false, error: `Agent "${config.name}" already exists in this project.` };
  }

  let outcome: AddAgentCreateResult | AddAgentByoResult | AddAgentError;
  if (config.agentType === 'import') {
    outcome = await handleImportPath(config, configBaseDir);
  } else if (config.agentType === 'create') {
    outcome = await handleCreatePath(config, configBaseDir);
  } else {
    outcome = await handleByoPath(config, configIO, configBaseDir);
  }

  if (!outcome.ok) {
    return { success: false, error: outcome.error };
  }
  return { success: true, outcome };
}

/**
 * Handle the "create" path: generate agent from template and write to project.
 */
async function handleCreatePath(
  config: AddAgentConfig,
  configBaseDir: string
): Promise<AddAgentCreateResult | AddAgentError> {
  // configBaseDir is the agentcore/ directory, project root is its parent
  const projectRoot = dirname(configBaseDir);
  const configIO = new ConfigIO({ baseDir: configBaseDir });
  const project = await configIO.readProjectSpec();

  const generateConfig = mapAddAgentConfigToGenerateConfig(config);
  const agentPath = join(projectRoot, APP_DIR, config.name);

  // Resolve credential strategy FIRST to determine correct credential name
  let identityProviders: ReturnType<typeof mapModelProviderToIdentityProviders> = [];
  let strategy: Awaited<ReturnType<typeof credentialPrimitive.resolveCredentialStrategy>> | undefined;

  if (config.modelProvider !== 'Bedrock') {
    strategy = await credentialPrimitive.resolveCredentialStrategy(
      project.name,
      config.name,
      config.modelProvider,
      config.apiKey,
      configBaseDir,
      project.credentials
    );

    // Build identity providers with the correct credential name from strategy
    identityProviders = [
      {
        name: strategy.credentialName,
        envVarName: strategy.envVarName,
      },
    ];
  }

  // Resolve the user-entered dockerfile path early (before rendering) so the
  // render config sees only the basename. This keeps templates that reference
  // `dockerfile` from accidentally interpolating an absolute or relative
  // host path. The actual file copy happens after the renderer writes its
  // template default, so we capture the source path here and apply it below.
  const resolvedDockerfile = resolveDockerfileSource(generateConfig.dockerfile);
  if (resolvedDockerfile.shouldCopy && resolvedDockerfile.sourcePath && resolvedDockerfile.filename) {
    if (!existsSync(resolvedDockerfile.sourcePath)) {
      return { ok: false, error: `Dockerfile not found at ${resolvedDockerfile.sourcePath}` };
    }
    generateConfig.dockerfile = resolvedDockerfile.filename;
  }

  // Generate agent files with correct identity provider
  const renderConfig = await mapGenerateConfigToRenderConfig(generateConfig, identityProviders);
  const renderer = createRenderer(renderConfig);
  await renderer.render({ outputDir: projectRoot });

  // If a user-supplied Dockerfile was resolved above, copy it into the agent
  // directory (overwriting the template default written by the renderer).
  if (resolvedDockerfile.shouldCopy && resolvedDockerfile.sourcePath && resolvedDockerfile.filename) {
    copyFileSync(resolvedDockerfile.sourcePath, join(agentPath, resolvedDockerfile.filename));
  }

  // Write agent to project config
  if (strategy) {
    await writeAgentToProject(generateConfig, { configBaseDir, credentialStrategy: strategy });

    // Always write env var (empty if skipped) so users can easily find and fill it in
    // Use project-scoped name if strategy returned empty (no API key case)
    const envVarName =
      strategy.envVarName || computeDefaultCredentialEnvVarName(`${project.name}${config.modelProvider}`);
    await setEnvVar(envVarName, config.apiKey ?? '', configBaseDir);
  } else {
    // Bedrock: no credentials needed
    await writeAgentToProject(generateConfig, { configBaseDir });
  }

  // Auto-create OAuth credential for CUSTOM_JWT inbound auth
  if (config.authorizerType === 'CUSTOM_JWT' && config.jwtConfig?.clientId && config.jwtConfig?.clientSecret) {
    await createManagedOAuthCredential(
      config.name,
      config.jwtConfig,
      spec => configIO.writeProjectSpec(spec),
      () => configIO.readProjectSpec()
    );
  }

  // Set up Python environment if applicable
  let pythonSetupResult: PythonSetupResult | undefined;
  if (config.language === 'Python') {
    pythonSetupResult = await setupPythonProject({ projectDir: agentPath });
  }

  // Auto-create config bundle when opted in
  if (config.withConfigBundle) {
    await createConfigBundleForAgent(config.name, configBaseDir);
  }

  return {
    ok: true,
    type: 'create',
    agentName: config.name,
    projectName: project.name,
    projectPath: agentPath,
    pythonSetupResult,
  };
}

/**
 * Handle the "import" path: import from Bedrock Agents.
 */
async function handleImportPath(
  config: AddAgentConfig,
  configBaseDir: string
): Promise<AddAgentCreateResult | AddAgentError> {
  const projectRoot = dirname(configBaseDir);
  const configIO = new ConfigIO({ baseDir: configBaseDir });
  const project = await configIO.readProjectSpec();
  const agentPath = join(projectRoot, APP_DIR, config.name);

  const result = await executeImportAgent({
    name: config.name,
    framework: config.framework,
    memory: config.memory,
    bedrockRegion: config.bedrockRegion!,
    bedrockAgentId: config.bedrockAgentId!,
    bedrockAliasId: config.bedrockAliasId!,
    configBaseDir,
    authorizerType: config.authorizerType,
    jwtConfig: config.jwtConfig,
    idleTimeout: config.idleRuntimeSessionTimeout,
    maxLifetime: config.maxLifetime,
    sessionStorageMountPath: config.sessionStorageMountPath,
  });

  if (!result.success) {
    return { ok: false, error: result.error ?? 'Unknown error' };
  }

  return {
    ok: true,
    type: 'create',
    agentName: config.name,
    projectName: project.name,
    projectPath: agentPath,
  };
}

/**
 * Handle the "byo" path: just write config to project (no file generation).
 */
async function handleByoPath(
  config: AddAgentConfig,
  configIO: ConfigIO,
  configBaseDir: string
): Promise<AddAgentByoResult | AddAgentError> {
  // Ensure the code folder exists (create if it doesn't)
  const projectRoot = dirname(configBaseDir);
  const codeDir = join(projectRoot, config.codeLocation.replace(/\/$/, ''));
  mkdirSync(codeDir, { recursive: true });

  // If dockerfile is a path (contains /), copy it into the code directory and use the filename
  let dockerfileName = config.dockerfile;
  const resolvedDockerfile = resolveDockerfileSource(dockerfileName);
  if (resolvedDockerfile.shouldCopy && resolvedDockerfile.sourcePath && resolvedDockerfile.filename) {
    if (!existsSync(resolvedDockerfile.sourcePath)) {
      return { ok: false, error: `Dockerfile not found at ${resolvedDockerfile.sourcePath}` };
    }
    dockerfileName = resolvedDockerfile.filename;
    copyFileSync(resolvedDockerfile.sourcePath, join(codeDir, dockerfileName));
  } else if (dockerfileName) {
    // Bare-filename case: the user referenced a Dockerfile expected to already
    // exist in their codeLocation. Surface a clear error here rather than
    // letting it fail at deploy/build time with a less helpful message.
    if (!existsSync(join(codeDir, dockerfileName))) {
      return {
        ok: false,
        error: `Dockerfile "${dockerfileName}" not found in code location "${config.codeLocation}". Provide a path to a Dockerfile to copy in, or place the file at ${join(codeDir, dockerfileName)}.`,
      };
    }
  }

  const project = await configIO.readProjectSpec();
  const agent = mapByoConfigToAgent({ ...config, dockerfile: dockerfileName });

  // Append new agent
  project.runtimes.push(agent);

  // Handle credential creation with smart reuse detection
  if (config.modelProvider !== 'Bedrock') {
    const strategy = await credentialPrimitive.resolveCredentialStrategy(
      project.name,
      config.name,
      config.modelProvider,
      config.apiKey,
      configBaseDir,
      project.credentials
    );

    if (!strategy.reuse) {
      const credentials = mapModelProviderToCredentials(config.modelProvider, project.name);
      if (credentials.length > 0) {
        credentials[0]!.name = strategy.credentialName;
        project.credentials.push(...credentials);
      }
    }

    // Write updated project
    await configIO.writeProjectSpec(project);

    // Always write env var (empty if skipped) so users can easily find and fill it in
    // Use project-scoped name if strategy returned empty (no API key case)
    const envVarName =
      strategy.envVarName || computeDefaultCredentialEnvVarName(`${project.name}${config.modelProvider}`);
    await setEnvVar(envVarName, config.apiKey ?? '', configBaseDir);
  } else {
    // Bedrock: no credentials needed
    await configIO.writeProjectSpec(project);
  }

  // Auto-create OAuth credential for CUSTOM_JWT inbound auth
  if (config.authorizerType === 'CUSTOM_JWT' && config.jwtConfig?.clientId && config.jwtConfig?.clientSecret) {
    await createManagedOAuthCredential(
      config.name,
      config.jwtConfig,
      spec => configIO.writeProjectSpec(spec),
      () => configIO.readProjectSpec()
    );
  }

  return { ok: true, type: 'byo', agentName: config.name, projectName: project.name };
}
