import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4010),
  DATA_PROVIDER: z.enum(['demo', 'live', 'postgres']).default('demo'),
  DATABASE_URL: z.string().optional(),
  LIVE_CUSTOMER_ID: z.string().default('cust-test-tenant'),
  LIVE_CUSTOMER_NAME: z.string().default('Test Tenant Organization'),
  LIVE_TENANT_ID: z.string().default('00000000-0000-0000-0000-000000000000'),
  LIVE_TENANT_DOMAIN: z.string().default('contoso.onmicrosoft.com'),
  LIVE_DATA_DIR: z.string().default('./data/live-snapshots'),
  AUTH_MODE: z.enum(['demo', 'entra']).default('demo'),
  ENTRA_TENANT_ID: z.string().optional(),
  ENTRA_CLIENT_ID: z.string().optional(),
  ENTRA_API_AUDIENCE: z.string().optional(),
  GRAPH_CLIENT_ID: z.string().optional(),
  GRAPH_CLIENT_SECRET: z.string().optional(),
  ENABLE_BETA_CONNECTORS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  SECRET_PROVIDER: z.enum(['env', 'azure-keyvault']).default('env'),
  AZURE_KEY_VAULT_URI: z.string().optional(),
  POWERSHELL_SNAPSHOT_DIR: z.string().default('./collectors/powershell/output'),
  SENTINEL_WORKSPACE_ID: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3010,http://127.0.0.1:3010'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),
});

export type AppEnv = z.infer<typeof EnvSchema>;

function loadDotEnvIfPresent(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const raw = readFileSync(candidate, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = val;
      }
    }
    break;
  }
}

export function loadEnv(source?: Record<string, string | undefined>): AppEnv {
  if (!source) {
    loadDotEnvIfPresent();
    return EnvSchema.parse(process.env);
  }
  return EnvSchema.parse(source);
}
