/**
 * Error indicating no agentcore project was found in the working directory.
 */
export class NoProjectError extends Error {
  constructor(message?: string) {
    super(message ?? 'No agentcore project found. Run "agentcore create" first.');
    this.name = 'NoProjectError';
  }
}

/**
 * Error thrown when an agent with the same name already exists.
 */
export class AgentAlreadyExistsError extends Error {
  constructor(agentName: string) {
    super(`An agent named "${agentName}" already exists in the schema.`);
    this.name = 'AgentAlreadyExistsError';
  }
}

/**
 * Error indicating an AWS permissions failure (AccessDenied / AccessDeniedException).
 */
export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

/**
 * Error indicating missing system dependencies required for an operation.
 */
export class DependencyCheckError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join('\n'));
    this.name = 'DependencyCheckError';
    this.errors = errors;
  }
}

/**
 * Error indicating git repository initialization failed.
 */
export class GitInitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitInitError';
  }
}

/**
 * Error indicating a referenced resource could not be found.
 */
export class ResourceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceNotFoundError';
  }
}

/**
 * Error indicating a precondition or input validation check failed.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Error indicating an operation exceeded its time limit.
 */
export class OperationTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationTimeoutError';
  }
}

/**
 * Error indicating a resource already exists (name collision).
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
