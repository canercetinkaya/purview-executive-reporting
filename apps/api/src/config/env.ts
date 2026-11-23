import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4010),
  DATA_PROVIDER: z.enum(['demo', 'postgres']).default('demo'),
  DATABASE_URL: z.string().optional(),
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

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return EnvSchema.parse(source);
}
