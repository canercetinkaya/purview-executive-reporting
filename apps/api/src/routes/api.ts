import { Router } from 'express';
import { z } from 'zod';
import {
  ALL_ROLES,
  getRolePermissions,
  hasPermission,
  type ManagedServiceActivity,
  type TrendWindow,
} from '@purview-portal/domain';
import { buildManagedServiceBreakdown } from '../analytics/managedService.js';
import { generateExecutiveNarrative } from '../analytics/narrative.js';
import { buildMonthlyScorecard } from '../analytics/scorecard.js';
import {
  computePeriodDelta,
  sliceTrendHistory,
  toTrendSeries,
} from '../analytics/trends.js';
import {
  DEMO_PERSONAS,
  requireCustomerScope,
  requirePermission,
  type AuthenticatedRequest,
} from '../auth/middleware.js';
import type { IPortalRepository } from '../persistence/repository.js';
import { exportScorecardToCsv } from '../reporting/csvExporter.js';

const TrendWindowSchema = z.enum(['MoM', '3M', '6M', '12M', 'QoQ', 'YoY']).default('6M');

const RecommendationPatchSchema = z.object({
  status: z.enum(['Open', 'InProgress', 'AcceptedRisk', 'Resolved']),
});

const NewActivitySchema = z.object({
  periodId: z.string().regex(/^\d{4}-\d{2}$/),
  category: z.enum([
    'AlertTriage',
    'IncidentInvestigation',
    'CaseClosure',
    'PolicyTuning',
    'DlpRuleChange',
    'SensitivityLabelChange',
    'FalsePositiveReduction',
    'ExceptionReview',
    'RecommendationAssessment',
    'HealthCheck',
    'CustomerRequest',
    'AutomationRemediation',
  ]),
  title: z.string().min(4).max(160),
  summary: z.string().min(10).max(1000),
  outcome: z.string().min(6).max(600),
});

export function createApiRouter(repo: IPortalRepository): Router {
  const router = Router();

  function paramStr(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? '';
    return value ?? '';
  }

  async function resolvePeriodSnapshots(customerIdParam: string | string[] | undefined, periodQuery?: unknown) {
    const customerId = paramStr(customerIdParam);
    const customer = await repo.getCustomer(customerId);
    if (!customer) return null;
    const snapshots = await repo.listSnapshots(customerId);
    if (snapshots.length === 0) return { customer, snapshots, current: null, previous: null };

    const periodId = typeof periodQuery === 'string' && periodQuery.length > 0 ? periodQuery : undefined;
    const idx = periodId
      ? snapshots.findIndex((s) => s.period.periodId === periodId)
      : snapshots.length - 1;
    if (idx < 0) return { customer, snapshots, current: null, previous: null };

    const current = snapshots[idx]!;
    const previous = idx > 0 ? snapshots[idx - 1]! : null;
    return { customer, snapshots, current, previous };
  }

  router.get('/me', (req: AuthenticatedRequest, res) => {
    const principal = req.principal!;
    res.json({
      principal,
      permissions: getRolePermissions(principal.role),
      demoMode: repo.mode === 'demo',
      availableDemoPersonas: principal.authMethod === 'demo' ? DEMO_PERSONAS : [],
    });
  });

  router.get('/customers', requirePermission('portal:read'), async (req: AuthenticatedRequest, res) => {
    const principal = req.principal!;
    const all = await repo.listCustomers();
    const visible = hasPermission(principal.role, 'tenants:cross_customer') &&
      principal.assignedCustomerIds.length === 0
      ? all
      : all.filter((c) => principal.assignedCustomerIds.includes(c.id));

    const enriched = await Promise.all(
      visible.map(async (customer) => {
        const [tenant, subscription, snapshots] = await Promise.all([
          repo.getTenant(customer.tenantId),
          repo.getSubscription(customer.id),
          repo.listSnapshots(customer.id),
        ]);
        return {
          ...customer,
          tenant,
          subscription,
          availablePeriods: snapshots.map((s) => ({
            periodId: s.period.periodId,
            label: s.period.label,
          })),
        };
      }),
    );

    res.json({ demoMode: repo.mode === 'demo', customers: enriched });
  });

  router.get(
    '/customers/:customerId/overview',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved) {
        res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' });
        return;
      }
      if (!resolved.current) {
        res.status(404).json({ error: 'PERIOD_NOT_FOUND', message: 'Requested reporting period not found.' });
        return;
      }

      const windowParse = TrendWindowSchema.safeParse(req.query.window ?? '6M');
      const window: TrendWindow = windowParse.success ? windowParse.data : '6M';
      const { customer, snapshots, current, previous } = resolved;

      const [recommendations, subscription, tenant] = await Promise.all([
        repo.listRecommendations(customer.id),
        repo.getSubscription(customer.id),
        repo.getTenant(customer.tenantId),
      ]);

      const history = toTrendSeries(sliceTrendHistory(snapshots, current.period.periodId, window));
      const deltas = computePeriodDelta(snapshots, current.period.periodId, window);
      const scorecard = buildMonthlyScorecard(current, previous);
      const narrative = generateExecutiveNarrative(current, previous, recommendations);

      res.json({
        isDemo: current.isDemo,
        customer,
        tenant,
        subscription,
        period: current.period,
        previousPeriod: previous?.period ?? null,
        availablePeriods: snapshots.map((s) => ({ periodId: s.period.periodId, label: s.period.label })),
        window,
        deltas,
        history,
        snapshot: current,
        scorecard,
        narrative,
        openRecommendationsCount: recommendations.filter((r) => r.status !== 'Resolved').length,
      });
    },
  );

  router.get(
    '/customers/:customerId/executive-summary',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      const recommendations = await repo.listRecommendations(resolved.customer.id);
      const narrative = generateExecutiveNarrative(resolved.current, resolved.previous, recommendations);
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        postureScore: resolved.current.postureScore,
        narrative,
      });
    },
  );

  router.get(
    '/customers/:customerId/purview/dlp',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      const window: TrendWindow = TrendWindowSchema.catch('6M').parse(req.query.window);
      const history = toTrendSeries(
        sliceTrendHistory(resolved.snapshots, resolved.current.period.periodId, window),
      );
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        dlp: resolved.current.dlp,
        previousDlp: resolved.previous?.dlp ?? null,
        history,
      });
    },
  );

  router.get(
    '/customers/:customerId/purview/information-protection',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      const history = toTrendSeries(
        sliceTrendHistory(resolved.snapshots, resolved.current.period.periodId, '6M'),
      );
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        informationProtection: resolved.current.informationProtection,
        history,
      });
    },
  );

  router.get(
    '/customers/:customerId/purview/insider-risk',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        insiderRisk: resolved.current.insiderRisk,
      });
    },
  );

  router.get(
    '/customers/:customerId/purview/communication-compliance',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        communicationCompliance: resolved.current.communicationCompliance,
      });
    },
  );

  router.get(
    '/customers/:customerId/purview/audit',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        auditAndEDiscovery: resolved.current.auditAndEDiscovery,
      });
    },
  );

  router.get(
    '/customers/:customerId/incidents',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        alertsAndIncidents: resolved.current.alertsAndIncidents,
      });
    },
  );

  router.get(
    '/customers/:customerId/managed-service',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        ...buildManagedServiceBreakdown(resolved.current.managedServiceValue),
      });
    },
  );

  router.post(
    '/customers/:customerId/managed-service/activities',
    requirePermission('managed_service:write'),
    requireCustomerScope(),
    async (req: AuthenticatedRequest, res) => {
      const parsed = NewActivitySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
        return;
      }

      const customerId = paramStr(req.params.customerId);
      const activity: ManagedServiceActivity = {
        id: `act-${Date.now()}`,
        customerId,
        periodId: parsed.data.periodId,
        performedAt: new Date().toISOString(),
        performedBy: req.principal!.displayName,
        category: parsed.data.category,
        title: parsed.data.title,
        summary: parsed.data.summary,
        outcome: parsed.data.outcome,
        origin: 'ManagedServiceTeam',
      };

      const saved = await repo.addManagedServiceActivity(activity);
      if (!saved) {
        res.status(404).json({ error: 'PERIOD_NOT_FOUND', message: 'Target period snapshot not found.' });
        return;
      }
      res.status(201).json({ activity: saved });
    },
  );

  router.get(
    '/customers/:customerId/recommendations',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const customer = await repo.getCustomer(paramStr(req.params.customerId));
      if (!customer) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Customer not found.' });
        return;
      }
      const recommendations = await repo.listRecommendations(customer.id);
      res.json({ isDemo: customer.isDemo, customer, recommendations });
    },
  );

  router.patch(
    '/customers/:customerId/recommendations/:recommendationId',
    requirePermission('recommendations:write'),
    requireCustomerScope(),
    async (req, res) => {
      const parsed = RecommendationPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues });
        return;
      }
      const updated = await repo.updateRecommendationStatus(
        paramStr(req.params.customerId),
        paramStr(req.params.recommendationId),
        parsed.data.status,
      );
      if (!updated) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Recommendation not found.' });
        return;
      }
      res.json({ recommendation: updated });
    },
  );

  router.get(
    '/customers/:customerId/scorecard',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      const scorecard = buildMonthlyScorecard(resolved.current, resolved.previous);
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        scorecard,
      });
    },
  );

  router.get(
    '/customers/:customerId/reports/export',
    requirePermission('reports:export'),
    requireCustomerScope(),
    async (req, res) => {
      const format = String(req.query.format ?? 'csv').toLowerCase();
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      const scorecard = buildMonthlyScorecard(resolved.current, resolved.previous);
      const recommendations = await repo.listRecommendations(resolved.customer.id);
      const narrative = generateExecutiveNarrative(resolved.current, resolved.previous, recommendations);

      if (format === 'json') {
        res.json({
          exportedAt: new Date().toISOString(),
          isDemo: resolved.current.isDemo,
          customer: resolved.customer,
          period: resolved.current.period,
          narrative,
          scorecard,
          snapshot: resolved.current,
          recommendations,
        });
        return;
      }

      const csv = exportScorecardToCsv(resolved.customer.name, resolved.current, scorecard);
      const safeName = resolved.customer.id.replace(/[^a-zA-Z0-9_-]/g, '');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="purview-scorecard-${safeName}-${resolved.current.period.periodId}.csv"`,
      );
      res.send(csv);
    },
  );

  router.get(
    '/customers/:customerId/observability/connectors',
    requirePermission('portal:read'),
    requireCustomerScope(),
    async (req, res) => {
      const resolved = await resolvePeriodSnapshots(req.params.customerId!, req.query.period);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Snapshot not found.' });
        return;
      }
      const runs = await repo.listCollectionRuns(resolved.customer.id);
      res.json({
        isDemo: resolved.current.isDemo,
        customer: resolved.customer,
        period: resolved.current.period,
        connectors: resolved.current.connectors,
        runs,
      });
    },
  );

  router.post(
    '/customers/:customerId/collection/trigger',
    requirePermission('collection:trigger'),
    requireCustomerScope(),
    async (req: AuthenticatedRequest, res) => {
      const customerId = paramStr(req.params.customerId);
      const periodQuery = typeof req.query.period === 'string' ? req.query.period : undefined;
      const triggeredBy = `${req.principal!.displayName} (${req.principal!.role})`;

      if (repo.mode === 'live' && repo.triggerLiveCollection) {
        const liveRun = await repo.triggerLiveCollection(customerId, periodQuery, triggeredBy);
        if (!liveRun) {
          res.status(404).json({ error: 'NOT_FOUND', message: 'Live customer not found.' });
          return;
        }
        res.status(202).json({ accepted: true, mode: repo.mode, run: liveRun });
        return;
      }

      const resolved = await resolvePeriodSnapshots(customerId, periodQuery);
      if (!resolved?.current) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Customer snapshot not found.' });
        return;
      }

      const started = new Date();
      const completed = new Date(started.getTime() + 1850);
      const run = {
        id: `run-manual-${Date.now()}`,
        customerId: resolved.customer.id,
        periodId: resolved.current.period.periodId,
        startedAt: started.toISOString(),
        completedAt: completed.toISOString(),
        durationMs: 1850,
        triggeredBy,
        status: 'PartialSuccess' as const,
        throttleEvents429: 0,
        apiFailures: 0,
        authFailures: 0,
        connectorSummary: resolved.current.connectors.map((c) => ({
          connectorId: c.connectorId,
          status: c.status,
          records: c.recordsCollected,
          durationMs: c.durationMs,
          message: c.statusDetail,
        })),
      };
      await repo.saveCollectionRun(run);
      res.status(202).json({
        accepted: true,
        mode: repo.mode,
        run,
      });
    },
  );

  router.get('/administration/roles', requirePermission('admin:read'), (_req, res) => {
    const matrix = ALL_ROLES.map((role) => ({
      role,
      permissions: getRolePermissions(role),
      tenantScoped: !hasPermission(role, 'tenants:cross_customer'),
    }));
    res.json({
      roles: matrix,
      demoPersonas: DEMO_PERSONAS,
    });
  });

  return router;
}
