import type {
  ConnectorAvailabilityStatus,
  ConnectorId,
  DataSourceDescriptor,
} from '@purview-portal/domain';
import { logEvent } from '../observability/logger.js';

export interface ConnectorContext {
  customerId: string;
  azureTenantId: string;
  periodStartIso: string;
  periodEndIso: string;
  clientId?: string;
  clientSecret?: string;
  enableBeta?: boolean;
  powershellSnapshotDir?: string;
  sentinelWorkspaceId?: string;
}

export interface ConnectorHealth {
  connectorId: ConnectorId;
  status: ConnectorAvailabilityStatus;
  detail: string;
  lastCheckedAt: string;
  throttleCount429: number;
  durationMs: number;
}

export interface ConnectorCollectionResult<TNormalized = unknown> {
  descriptor: DataSourceDescriptor;
  normalized: TNormalized | null;
}

export interface IMicrosoftConnector<TRaw = unknown, TNormalized = unknown> {
  readonly connectorId: ConnectorId;
  readonly displayName: string;
  readonly microsoftProduct: string;
  readonly requiredPermissions: string[];
  readonly isBeta: boolean;

  initialize(context: ConnectorContext): Promise<void>;
  validatePermissions(): Promise<{ valid: boolean; status: ConnectorAvailabilityStatus; detail: string }>;
  testConnection(): Promise<boolean>;
  collect(): Promise<TRaw>;
  normalize(raw: TRaw): TNormalized;
  getHealth(): ConnectorHealth;
  getLastCollectionStatus(): DataSourceDescriptor | null;
}

export interface GraphHttpClientOptions {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  maxRetries?: number;
  maxPages?: number;
  baseBackoffMs?: number;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

export class MicrosoftApiError extends Error {
  public readonly statusCode: number;
  public readonly availabilityStatus: ConnectorAvailabilityStatus;

  constructor(
    message: string,
    statusCode: number,
    availabilityStatus: ConnectorAvailabilityStatus,
  ) {
    super(message);
    this.name = 'MicrosoftApiError';
    this.statusCode = statusCode;
    this.availabilityStatus = availabilityStatus;
  }
}

export function classifyHttpStatus(statusCode: number, bodyText = ''): ConnectorAvailabilityStatus {
  if (statusCode === 401 || statusCode === 403) {
    if (/not licensed|license|subscription|e5|p2/i.test(bodyText)) {
      return 'NotLicensed';
    }
    return 'PermissionMissing';
  }
  if (statusCode === 404 || statusCode === 410 || statusCode === 501) {
    return 'ApiUnsupported';
  }
  return 'CollectionFailed';
}

/**
 * Shared resilient HTTP client for Microsoft Graph & Office 365 Management APIs.
 * Supports:
 * - OAuth2 client_credentials token acquisition & proactive refresh (<5 min remaining)
 * - HTTP 429 Retry-After header honoring
 * - Exponential backoff for transient 5xx failures
 * - @odata.nextLink pagination with safety page limit
 */
export class GraphHttpClient {
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly maxPages: number;
  private readonly baseBackoffMs: number;
  private readonly tokenCache = new Map<string, CachedToken>();

  public throttleCount429 = 0;

  constructor(options: GraphHttpClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleepFn = options.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = options.maxRetries ?? 4;
    this.maxPages = options.maxPages ?? 50;
    this.baseBackoffMs = options.baseBackoffMs ?? 500;
  }

  public async getAccessToken(params: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    scope: string;
  }): Promise<string> {
    const cacheKey = `${params.tenantId}:${params.scope}`;
    const existing = this.tokenCache.get(cacheKey);
    const fiveMinutesMs = 5 * 60 * 1000;
    if (existing && existing.expiresAtMs - Date.now() > fiveMinutesMs) {
      return existing.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(params.tenantId)}/oauth2/v2.0/token`;
    const form = new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      scope: params.scope,
      grant_type: 'client_credentials',
    });

    const resp = await this.fetchFn(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new MicrosoftApiError(
        `Entra token acquisition failed with HTTP ${resp.status}`,
        resp.status,
        classifyHttpStatus(resp.status, text),
      );
    }

    const payload = (await resp.json()) as { access_token: string; expires_in?: number };
    const expiresInSec = Number(payload.expires_in ?? 3600);
    this.tokenCache.set(cacheKey, {
      accessToken: payload.access_token,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    });
    return payload.access_token;
  }

  public async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    let attempt = 0;
    while (true) {
      attempt += 1;
      const response = await this.fetchFn(url, init);

      if (response.ok) {
        if (response.status === 204) {
          return {} as T;
        }
        return (await response.json()) as T;
      }

      if (response.status === 429) {
        this.throttleCount429 += 1;
        if (attempt > this.maxRetries) {
          throw new MicrosoftApiError('Microsoft API throttling limit exceeded (HTTP 429).', 429, 'CollectionFailed');
        }
        const retryAfterHeader = response.headers.get('Retry-After');
        const retrySec = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
        const waitMs = Number.isFinite(retrySec) && retrySec > 0
          ? retrySec * 1000
          : this.baseBackoffMs * Math.pow(2, attempt - 1);
        logEvent('warn', 'Microsoft API returned HTTP 429; waiting before retry', {
          attempt,
          waitMs,
        });
        await this.sleepFn(waitMs);
        continue;
      }

      if (response.status >= 500 && attempt <= this.maxRetries) {
        const waitMs = this.baseBackoffMs * Math.pow(2, attempt - 1);
        logEvent('warn', 'Microsoft API transient 5xx error; backing off', {
          status: response.status,
          attempt,
          waitMs,
        });
        await this.sleepFn(waitMs);
        continue;
      }

      const bodyText = await response.text().catch(() => '');
      throw new MicrosoftApiError(
        `Microsoft API call failed with HTTP ${response.status}`,
        response.status,
        classifyHttpStatus(response.status, bodyText),
      );
    }
  }

  public async getPagedCollection<TItem>(
    initialUrl: string,
    tokenProvider: () => Promise<string>,
  ): Promise<TItem[]> {
    const items: TItem[] = [];
    let nextUrl: string | undefined = initialUrl;
    let page = 0;

    while (nextUrl && page < this.maxPages) {
      const token = await tokenProvider();
      const pageData: {
        value?: TItem[];
        '@odata.nextLink'?: string;
      } = await this.requestJson<{
        value?: TItem[];
        '@odata.nextLink'?: string;
      }>(nextUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (Array.isArray(pageData.value)) {
        items.push(...pageData.value);
      }
      nextUrl = pageData['@odata.nextLink'];
      page += 1;
    }

    return items;
  }
}
