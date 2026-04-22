/**
 * Compute the default env var name for a credential.
 * Extracted to a standalone utility to avoid circular dependencies
 * between CredentialPrimitive and TUI screens that use this function.
 */
export function computeDefaultCredentialEnvVarName(credentialName: string): string {
  return `AGENTCORE_CREDENTIAL_${credentialName.replace(/-/g, '_').toUpperCase()}`;
}

/**
 * Compute the managed OAuth credential name for a gateway.
 * Used when creating the credential (GatewayPrimitive) and when
 * looking it up for code generation (schema-mapper).
 */
export function computeManagedOAuthCredentialName(gatewayName: string): string {
  return `${gatewayName}-oauth`;
}

/**
 * Compute the default credential name for a model provider.
 * Project-scoped (not resource-scoped) to enable sharing across agents/harnesses
 * that use the same API key. Format: {projectName}{providerName}.
 * Must stay in sync with the lookup logic in CredentialPrimitive.resolveCredentialStrategy.
 */
export function computeCredentialName(projectName: string, providerName: string): string {
  return `${projectName}${providerName}`;
}
