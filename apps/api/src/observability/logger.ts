const REDACTED_KEYS = new Set([
  'authorization',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'secret',
  'password',
  'cookie',
  'set-cookie',
  'apikey',
  'api_key',
  'x-api-key',
]);

export function redactSensitiveFields(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key.toLowerCase())) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactSensitiveFields(val, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === 'string' && value.startsWith('Bearer ')) {
    return 'Bearer [REDACTED]';
  }
  return value;
}

export type LogLevel = 'info' | 'warn' | 'error';

export function logEvent(
  level: LogLevel,
  message: string,
  metadata: Record<string, unknown> = {},
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(redactSensitiveFields(metadata) as Record<string, unknown>),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else if (process.env.NODE_ENV !== 'test') {
    console.log(line);
  }
}
