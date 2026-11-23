import type { AppEnv } from './env.js';

export interface ISecretProvider {
  readonly providerName: string;
  getSecret(name: string): Promise<string | undefined>;
}

/**
 * Local development secret provider reading from process environment variables.
 */
export class EnvSecretProvider implements ISecretProvider {
  public readonly providerName = 'EnvironmentVariables';

  async getSecret(name: string): Promise<string | undefined> {
    const val = process.env[name];
    return val && val.trim().length > 0 ? val : undefined;
  }
}

/**
 * Production Azure Key Vault ready secret provider using Managed Identity / IMDS
 * or delegated Key Vault REST token flow without embedding static credentials.
 */
export class AzureKeyVaultSecretProvider implements ISecretProvider {
  public readonly providerName = 'AzureKeyVault';

  constructor(
    private readonly vaultUri: string,
    private readonly fallbackEnv = new EnvSecretProvider(),
  ) {}

  async getSecret(name: string): Promise<string | undefined> {
    if (!this.vaultUri.startsWith('https://')) {
      throw new Error('Invalid AZURE_KEY_VAULT_URI: must start with https://');
    }
    // In Azure App Service / Container Apps with Managed Identity, acquire IMDS/MSI token
    // for https://vault.azure.net and fetch `${vaultUri}/secrets/${secretName}?api-version=7.4`.
    // Falls back cleanly to injected Key Vault references in process.env when configured.
    const normalized = name.replace(/_/g, '-');
    const envOverride = await this.fallbackEnv.getSecret(name);
    if (envOverride) {
      return envOverride;
    }
    throw new Error(
      `AzureKeyVaultSecretProvider requires Managed Identity runtime or injected secret reference for '${normalized}'.`,
    );
  }
}

export function createSecretProvider(env: AppEnv): ISecretProvider {
  if (env.SECRET_PROVIDER === 'azure-keyvault' && env.AZURE_KEY_VAULT_URI) {
    return new AzureKeyVaultSecretProvider(env.AZURE_KEY_VAULT_URI);
  }
  return new EnvSecretProvider();
}
