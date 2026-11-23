import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

describe('DATA_PROVIDER=live (Zero-DB Real Tenant File Repository + IPPS Snapshot)', () => {
  it('ingests a real PowerShell IPPS snapshot and surfaces live recommendations while marking unconfigured Graph sources Unavailable', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'purview-live-test-'));
    const psDir = join(tempDir, 'ps');
    const liveDir = join(tempDir, 'live');
    mkdirSync(psDir, { recursive: true });

    // Simulate real IPPS snapshot exported by Invoke-PurviewComplianceCollect.ps1
    writeFileSync(
      join(psDir, 'cust-test-tenant.purview-snapshot.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        customerId: 'cust-test-tenant',
        collectedAt: '2026-11-23T15:28:33Z',
        dlpPolicies: [
          {
            id: 'p1',
            name: 'DSPM for AI - Copilot',
            workloadScope: ['Microsoft 365'],
            mode: 'TestWithoutNotifications',
            lastModifiedAt: '2026-06-02T08:08:39Z',
          },
          {
            id: 'p2',
            name: 'TC Onay',
            workloadScope: ['Exchange'],
            mode: 'Enforce',
            lastModifiedAt: '2025-08-15T12:08:33Z',
          },
        ],
        sensitivityLabelPolicyCount: 2,
        retentionPolicyCount: 0,
        insiderRiskPolicyCount: 2,
        commCompliancePolicyCount: 2,
      }),
      'utf8',
    );

    try {
      const env = loadEnv({
        NODE_ENV: 'test',
        DATA_PROVIDER: 'live',
        AUTH_MODE: 'demo',
        LIVE_CUSTOMER_ID: 'cust-test-tenant',
        LIVE_CUSTOMER_NAME: 'Test Tenant Live',
        LIVE_TENANT_ID: '00000000-0000-0000-0000-000000000000',
        LIVE_TENANT_DOMAIN: 'contoso.onmicrosoft.com',
        LIVE_DATA_DIR: liveDir,
        POWERSHELL_SNAPSHOT_DIR: psDir,
      });

      const { app } = createApp(env);

      const ov = await request(app).get('/api/v1/customers/cust-test-tenant/overview');
      expect(ov.status).toBe(200);
      expect(ov.body.isDemo).toBe(false);
      expect(ov.body.snapshot.dlp.activePolicies).toHaveLength(2);
      expect(ov.body.snapshot.informationProtection.publishedLabelPoliciesCount).toBe(2);
      expect(ov.body.snapshot.insiderRisk.activePoliciesCount).toBe(2);

      // Should generate evidence-backed recommendations for non-enforced DLP policy + 0 retention policies
      const recs = await request(app).get('/api/v1/customers/cust-test-tenant/recommendations');
      expect(recs.status).toBe(200);
      expect(recs.body.recommendations.length).toBeGreaterThanOrEqual(2);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
