export async function fetchPortalJson<T>(
  path: string,
  options: {
    personaId?: string;
    method?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.personaId) {
    headers['x-demo-persona'] = options.personaId;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(errBody.message || `API request failed (${response.status})`);
  }

  return (await response.json()) as T;
}
