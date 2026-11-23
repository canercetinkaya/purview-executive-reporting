import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { redactSensitiveFields } from '../src/observability/logger.js';
import { sanitizeCsvCell } from '../src/reporting/csvExporter.js';

describe('Security Hardening: Log Redaction, CSV Injection & SQL Schema', () => {
  it('redacts tokens, client secrets, and Bearer headers recursively', () => {
    const redacted = redactSensitiveFields({
      tenantId: 'tenant-123',
      access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.secret',
      refresh_token: 'rt-secret',
      nested: {
        client_secret: 'super-secret-value',
        authorization: 'Bearer abc.def.ghi',
      },
      bearerString: 'Bearer raw-token-value',
    }) as {
      tenantId: string;
      access_token: string;
      refresh_token: string;
      nested: { client_secret: string; authorization: string };
      bearerString: string;
    };

    expect(redacted.tenantId).toBe('tenant-123');
    expect(redacted.access_token).toBe('[REDACTED]');
    expect(redacted.refresh_token).toBe('[REDACTED]');
    expect(redacted.nested.client_secret).toBe('[REDACTED]');
    expect(redacted.nested.authorization).toBe('[REDACTED]');
    expect(redacted.bearerString).toBe('Bearer [REDACTED]');
  });

  it('neutralizes spreadsheet formula injection in CSV export cells (CWE-1236)', () => {
    expect(sanitizeCsvCell('=CMD|"/C calc"!A0')).toBe('"\'=CMD|""/C calc""!A0"');
    expect(sanitizeCsvCell('+SUM(A1:A2)')).toBe('"\'+SUM(A1:A2)"');
    expect(sanitizeCsvCell('@HYPERLINK("http://evil")')).toBe('"\'@HYPERLINK(""http://evil"")"');
    expect(sanitizeCsvCell('Normal Metric')).toBe('"Normal Metric"');
  });

  it('validates PostgreSQL initial migration contains all required multi-tenant tables', () => {
    const sqlPath = resolve(process.cwd(), 'src/persistence/migrations/001_initial_schema.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    for (const table of [
      'tenants',
      'customers',
      'subscriptions',
      'reporting_periods',
      'monthly_snapshots',
      'recommendations',
      'managed_service_activities',
      'collection_runs',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });
});
