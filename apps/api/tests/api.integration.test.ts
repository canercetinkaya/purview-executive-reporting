import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

describe('API Integration, RBAC & Multi-Tenant Isolation', () => {
  const { app } = createApp(loadEnv({ NODE_ENV: 'test', DATA_PROVIDER: 'demo', AUTH_MODE: 'demo' }));

  it('serves /health and /ready probes cleanly', async () => {
    const h = await request(app).get('/health');
    expect(h.status).toBe(200);
    expect(h.body.status).toBe('ok');
    expect(h.body.provider).toBe('demo');

    const r = await request(app).get('/ready');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ready');
  });

  it('returns 14 months of demo data clearly flagged isDemo=true for Contoso', async () => {
    const res = await request(app).get('/api/v1/customers/cust-contoso-fin/overview?window=12M');
    expect(res.status).toBe(200);
    expect(res.body.isDemo).toBe(true);
    expect(res.body.availablePeriods.length).toBe(14);
    expect(res.body.history.length).toBe(12);
    expect(res.body.snapshot.postureScore.overallScore).toBeGreaterThan(60);
    expect(res.body.narrative.overallStatus).toContain('DLP signals');
  });

  it('blocks cross-tenant access (IDOR protection) when Contoso user requests Northwind', async () => {
    const res = await request(app)
      .get('/api/v1/customers/cust-northwind-health/overview')
      .set('x-demo-persona', 'persona-contoso-exec');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('TENANT_ISOLATION_DENIED');

    // Only Contoso should appear in /customers for this persona
    const listRes = await request(app)
      .get('/api/v1/customers')
      .set('x-demo-persona', 'persona-contoso-exec');
    expect(listRes.status).toBe(200);
    expect(listRes.body.customers).toHaveLength(1);
    expect(listRes.body.customers[0].id).toBe('cust-contoso-fin');
  });

  it('enforces RBAC on write & export routes across roles', async () => {
    // CustomerReader cannot export CSV or log managed service activities
    const readerExport = await request(app)
      .get('/api/v1/customers/cust-contoso-fin/reports/export?format=csv')
      .set('x-demo-persona', 'persona-contoso-reader');
    expect(readerExport.status).toBe(403);

    const readerWrite = await request(app)
      .post('/api/v1/customers/cust-contoso-fin/managed-service/activities')
      .set('x-demo-persona', 'persona-contoso-reader')
      .send({
        periodId: '2026-11',
        category: 'AlertTriage',
        title: 'Unauthorized attempt',
        summary: 'Attempted write from read-only persona',
        outcome: 'Blocked by RBAC',
      });
    expect(readerWrite.status).toBe(403);

    // CustomerExecutive CAN export CSV
    const execExport = await request(app)
      .get('/api/v1/customers/cust-contoso-fin/reports/export?format=csv')
      .set('x-demo-persona', 'persona-contoso-exec');
    expect(execExport.status).toBe(200);
    expect(execExport.headers['content-type']).toContain('text/csv');
    expect(execExport.text).toContain('Security & Compliance Posture Score');

    // ServiceManager CAN log a new Managed Service activity and it increments human activity count
    const mgrWrite = await request(app)
      .post('/api/v1/customers/cust-contoso-fin/managed-service/activities')
      .set('x-demo-persona', 'persona-service-manager')
      .send({
        periodId: '2026-11',
        category: 'DlpRuleChange',
        title: 'Updated SWIFT Proxy Threshold',
        summary: 'Tightened high-severity threshold for outbound IBAN + SWIFT combinations.',
        outcome: 'Deployed to Enforce ring across Treasury.',
      });
    expect(mgrWrite.status).toBe(201);
    expect(mgrWrite.body.activity.origin).toBe('ManagedServiceTeam');

    // Validation check (short title rejected with 400)
    const badInput = await request(app)
      .post('/api/v1/customers/cust-contoso-fin/managed-service/activities')
      .set('x-demo-persona', 'persona-service-manager')
      .send({ periodId: 'invalid', category: 'DlpRuleChange', title: 'x', summary: 'y', outcome: 'z' });
    expect(badInput.status).toBe(400);
  });

  it('rejects unauthenticated requests with 401 when AUTH_MODE=entra', async () => {
    const { app: entraApp } = createApp(
      loadEnv({
        NODE_ENV: 'test',
        DATA_PROVIDER: 'demo',
        AUTH_MODE: 'entra',
        ENTRA_TENANT_ID: '11111111-2222-3333-4444-555555555555',
        ENTRA_API_AUDIENCE: 'api://purview-executive-reporting',
      }),
    );

    const noToken = await request(entraApp).get('/api/v1/customers');
    expect(noToken.status).toBe(401);
    expect(noToken.body.error).toBe('UNAUTHORIZED');
  });

  it('honestly flags NotLicensed and PermissionMissing modules for Northwind', async () => {
    const res = await request(app).get('/api/v1/customers/cust-northwind-health/overview');
    expect(res.status).toBe(200);
    expect(res.body.snapshot.communicationCompliance.status).toBe('NotLicensed');
    expect(res.body.snapshot.auditAndEDiscovery.eDiscoveryStatus).toBe('PermissionMissing');
    expect(res.body.narrative.dataLimitationsNote).toContain('NotLicensed');
  });
});
