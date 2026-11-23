import { Pool } from 'pg';
import type {
  CollectionRun,
  Customer,
  ManagedServiceActivity,
  MonthlySnapshot,
  Recommendation,
  RecommendationStatus,
  Subscription,
  Tenant,
} from '@purview-portal/domain';
import { applyNewActivityToSummary } from '../analytics/managedService.js';
import { createDemoSeed } from '../demo/demoDataProvider.js';
import type { AppEnv } from '../config/env.js';
import { LiveFileRepository } from './liveFileRepository.js';

export interface IPortalRepository {
  readonly mode: 'demo' | 'live' | 'postgres';
  listCustomers(): Promise<Customer[]>;
  getCustomer(customerId: string): Promise<Customer | null>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  getSubscription(customerId: string): Promise<Subscription | null>;
  listSnapshots(customerId: string): Promise<MonthlySnapshot[]>;
  getSnapshot(customerId: string, periodId?: string): Promise<MonthlySnapshot | null>;
  saveSnapshot(snapshot: MonthlySnapshot): Promise<void>;
  listRecommendations(customerId: string): Promise<Recommendation[]>;
  updateRecommendationStatus(
    customerId: string,
    recommendationId: string,
    status: RecommendationStatus,
  ): Promise<Recommendation | null>;
  addManagedServiceActivity(activity: ManagedServiceActivity): Promise<ManagedServiceActivity | null>;
  listCollectionRuns(customerId: string): Promise<CollectionRun[]>;
  saveCollectionRun(run: CollectionRun): Promise<void>;
  healthCheck(): Promise<boolean>;
  triggerLiveCollection?(customerId: string, periodId?: string, triggeredBy?: string): Promise<CollectionRun | null>;
}

/**
 * Deterministic 14-month in-memory demo store. Never mixes demo records with live production records.
 */
export class InMemoryDemoRepository implements IPortalRepository {
  public readonly mode = 'demo' as const;
  private readonly tenants: Tenant[];
  private readonly customers: Customer[];
  private readonly subscriptions: Subscription[];
  private readonly snapshots: MonthlySnapshot[];
  private readonly recommendations: Recommendation[];
  private readonly collectionRuns: CollectionRun[];

  constructor(seed = createDemoSeed()) {
    this.tenants = seed.tenants;
    this.customers = seed.customers;
    this.subscriptions = seed.subscriptions;
    this.snapshots = seed.snapshots;
    this.recommendations = seed.recommendations;
    this.collectionRuns = seed.collectionRuns;
  }

  async listCustomers(): Promise<Customer[]> {
    return [...this.customers];
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.customers.find((c) => c.id === customerId) ?? null;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.find((t) => t.id === tenantId) ?? null;
  }

  async getSubscription(customerId: string): Promise<Subscription | null> {
    return this.subscriptions.find((s) => s.customerId === customerId) ?? null;
  }

  async listSnapshots(customerId: string): Promise<MonthlySnapshot[]> {
    return this.snapshots
      .filter((s) => s.customerId === customerId && s.isDemo)
      .sort((a, b) => a.period.periodId.localeCompare(b.period.periodId));
  }

  async getSnapshot(customerId: string, periodId?: string): Promise<MonthlySnapshot | null> {
    const list = await this.listSnapshots(customerId);
    if (list.length === 0) return null;
    if (!periodId) return list[list.length - 1] ?? null;
    return list.find((s) => s.period.periodId === periodId) ?? null;
  }

  async saveSnapshot(snapshot: MonthlySnapshot): Promise<void> {
    const idx = this.snapshots.findIndex(
      (s) => s.customerId === snapshot.customerId && s.period.periodId === snapshot.period.periodId,
    );
    if (idx >= 0) {
      this.snapshots[idx] = snapshot;
    } else {
      this.snapshots.push(snapshot);
    }
  }

  async listRecommendations(customerId: string): Promise<Recommendation[]> {
    return this.recommendations.filter((r) => r.customerId === customerId);
  }

  async updateRecommendationStatus(
    customerId: string,
    recommendationId: string,
    status: RecommendationStatus,
  ): Promise<Recommendation | null> {
    const rec = this.recommendations.find(
      (r) => r.customerId === customerId && r.id === recommendationId,
    );
    if (!rec) return null;
    rec.status = status;
    rec.lastReviewed = new Date().toISOString().slice(0, 10);
    return rec;
  }

  async addManagedServiceActivity(activity: ManagedServiceActivity): Promise<ManagedServiceActivity | null> {
    const snap = await this.getSnapshot(activity.customerId, activity.periodId);
    if (!snap) return null;
    snap.managedServiceValue = applyNewActivityToSummary(snap.managedServiceValue, activity);
    return activity;
  }

  async listCollectionRuns(customerId: string): Promise<CollectionRun[]> {
    return this.collectionRuns
      .filter((r) => r.customerId === customerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async saveCollectionRun(run: CollectionRun): Promise<void> {
    this.collectionRuns.unshift(run);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

/**
 * Production PostgreSQL repository enforcing strict parameterized SQL queries and tenant_id/customer_id isolation.
 */
export class PostgresRepository implements IPortalRepository {
  public readonly mode = 'postgres' as const;
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async listCustomers(): Promise<Customer[]> {
    const { rows } = await this.pool.query(
      'SELECT id, tenant_id, name, industry, service_tier, primary_contact_email, is_demo FROM customers WHERE is_demo = FALSE ORDER BY name ASC',
    );
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      industry: r.industry,
      serviceTier: r.service_tier,
      primaryContactEmail: r.primary_contact_email,
      isDemo: Boolean(r.is_demo),
    }));
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    const { rows } = await this.pool.query(
      'SELECT id, tenant_id, name, industry, service_tier, primary_contact_email, is_demo FROM customers WHERE id = $1 AND is_demo = FALSE',
      [customerId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      industry: r.industry,
      serviceTier: r.service_tier,
      primaryContactEmail: r.primary_contact_email,
      isDemo: Boolean(r.is_demo),
    };
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const { rows } = await this.pool.query(
      'SELECT id, azure_tenant_id, primary_domain, license_tier, region FROM tenants WHERE id = $1',
      [tenantId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      azureTenantId: r.azure_tenant_id,
      primaryDomain: r.primary_domain,
      licenseTier: r.license_tier,
      region: r.region,
    };
  }

  async getSubscription(customerId: string): Promise<Subscription | null> {
    const { rows } = await this.pool.query(
      'SELECT id, customer_id, plan_name, licensed_seats, purview_modules_enabled FROM subscriptions WHERE customer_id = $1 LIMIT 1',
      [customerId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      customerId: r.customer_id,
      planName: r.plan_name,
      licensedSeats: Number(r.licensed_seats),
      purviewModulesEnabled: r.purview_modules_enabled ?? [],
    };
  }

  async listSnapshots(customerId: string): Promise<MonthlySnapshot[]> {
    const { rows } = await this.pool.query(
      'SELECT payload FROM monthly_snapshots WHERE customer_id = $1 AND is_demo = FALSE ORDER BY period_id ASC',
      [customerId],
    );
    return rows.map((r) => r.payload as MonthlySnapshot);
  }

  async getSnapshot(customerId: string, periodId?: string): Promise<MonthlySnapshot | null> {
    if (!periodId) {
      const { rows } = await this.pool.query(
        'SELECT payload FROM monthly_snapshots WHERE customer_id = $1 AND is_demo = FALSE ORDER BY period_id DESC LIMIT 1',
        [customerId],
      );
      return (rows[0]?.payload as MonthlySnapshot) ?? null;
    }
    const { rows } = await this.pool.query(
      'SELECT payload FROM monthly_snapshots WHERE customer_id = $1 AND period_id = $2 AND is_demo = FALSE LIMIT 1',
      [customerId, periodId],
    );
    return (rows[0]?.payload as MonthlySnapshot) ?? null;
  }

  async saveSnapshot(snapshot: MonthlySnapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO reporting_periods (period_id, label, start_iso, end_iso)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (period_id) DO NOTHING`,
      [snapshot.period.periodId, snapshot.period.label, snapshot.period.startIso, snapshot.period.endIso],
    );
    await this.pool.query(
      `INSERT INTO monthly_snapshots (id, customer_id, tenant_id, period_id, collected_at, is_demo, posture_score, payload)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)
       ON CONFLICT (customer_id, period_id, is_demo)
       DO UPDATE SET payload = EXCLUDED.payload, posture_score = EXCLUDED.posture_score, collected_at = EXCLUDED.collected_at`,
      [
        snapshot.id,
        snapshot.customerId,
        snapshot.tenantId,
        snapshot.period.periodId,
        snapshot.collectedAt,
        snapshot.postureScore.overallScore,
        JSON.stringify(snapshot),
      ],
    );
  }

  async listRecommendations(customerId: string): Promise<Recommendation[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM recommendations WHERE customer_id = $1 ORDER BY target_date ASC',
      [customerId],
    );
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      title: r.title,
      severity: r.severity,
      category: r.category,
      observation: r.observation,
      evidence: r.evidence,
      businessRisk: r.business_risk,
      technicalImpact: r.technical_impact,
      recommendedAction: r.recommended_action,
      owner: r.owner,
      targetDate: String(r.target_date),
      status: r.status,
      firstDetected: String(r.first_detected),
      lastReviewed: String(r.last_reviewed),
      microsoftDocsUrl: r.microsoft_docs_url,
    }));
  }

  async updateRecommendationStatus(
    customerId: string,
    recommendationId: string,
    status: RecommendationStatus,
  ): Promise<Recommendation | null> {
    const { rows } = await this.pool.query(
      'UPDATE recommendations SET status = $1, last_reviewed = CURRENT_DATE WHERE customer_id = $2 AND id = $3 RETURNING *',
      [status, customerId, recommendationId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      customerId: r.customer_id,
      title: r.title,
      severity: r.severity,
      category: r.category,
      observation: r.observation,
      evidence: r.evidence,
      businessRisk: r.business_risk,
      technicalImpact: r.technical_impact,
      recommendedAction: r.recommended_action,
      owner: r.owner,
      targetDate: String(r.target_date),
      status: r.status,
      firstDetected: String(r.first_detected),
      lastReviewed: String(r.last_reviewed),
      microsoftDocsUrl: r.microsoft_docs_url,
    };
  }

  async addManagedServiceActivity(activity: ManagedServiceActivity): Promise<ManagedServiceActivity | null> {
    const snap = await this.getSnapshot(activity.customerId, activity.periodId);
    if (!snap) return null;
    await this.pool.query(
      `INSERT INTO managed_service_activities (id, customer_id, period_id, performed_at, performed_by, category, title, summary, outcome, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ManagedServiceTeam')`,
      [
        activity.id,
        activity.customerId,
        activity.periodId,
        activity.performedAt,
        activity.performedBy,
        activity.category,
        activity.title,
        activity.summary,
        activity.outcome,
      ],
    );
    snap.managedServiceValue = applyNewActivityToSummary(snap.managedServiceValue, activity);
    await this.saveSnapshot(snap);
    return activity;
  }

  async listCollectionRuns(customerId: string): Promise<CollectionRun[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM collection_runs WHERE customer_id = $1 ORDER BY started_at DESC LIMIT 36',
      [customerId],
    );
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      periodId: r.period_id,
      startedAt: String(r.started_at),
      completedAt: String(r.completed_at),
      durationMs: Number(r.duration_ms),
      triggeredBy: r.triggered_by,
      status: r.status,
      throttleEvents429: Number(r.throttle_events_429),
      apiFailures: Number(r.api_failures),
      authFailures: Number(r.auth_failures),
      connectorSummary: r.connector_summary ?? [],
    }));
  }

  async saveCollectionRun(run: CollectionRun): Promise<void> {
    await this.pool.query(
      `INSERT INTO collection_runs (id, customer_id, period_id, started_at, completed_at, duration_ms, triggered_by, status, throttle_events_429, api_failures, auth_failures, connector_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        run.id,
        run.customerId,
        run.periodId,
        run.startedAt,
        run.completedAt,
        run.durationMs,
        run.triggeredBy,
        run.status,
        run.throttleEvents429,
        run.apiFailures,
        run.authFailures,
        JSON.stringify(run.connectorSummary),
      ],
    );
  }

  async healthCheck(): Promise<boolean> {
    await this.pool.query('SELECT 1');
    return true;
  }
}

export function createRepository(env: AppEnv): IPortalRepository {
  if (env.DATA_PROVIDER === 'live') {
    return new LiveFileRepository(env);
  }
  if (env.DATA_PROVIDER === 'postgres') {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required when DATA_PROVIDER=postgres');
    }
    return new PostgresRepository(env.DATABASE_URL);
  }
  return new InMemoryDemoRepository();
}
