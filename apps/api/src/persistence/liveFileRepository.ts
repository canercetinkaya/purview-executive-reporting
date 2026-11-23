import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import type { AppEnv } from '../config/env.js';
import { runLiveTenantCollection } from '../connectors/liveCollectionService.js';
import type { IPortalRepository } from './repository.js';

interface LiveStoreState {
  snapshots: MonthlySnapshot[];
  recommendations: Recommendation[];
  collectionRuns: CollectionRun[];
}

/**
 * File-backed live tenant repository (zero PostgreSQL setup required).
 * Reads real Microsoft Graph + O365 DLP.All + Security & Compliance PowerShell snapshots
 * for the configured customer tenant and persists monthly history under LIVE_DATA_DIR.
 */
export class LiveFileRepository implements IPortalRepository {
  public readonly mode = 'live' as const;
  private readonly storePath: string;
  private readonly tenant: Tenant;
  private readonly customer: Customer;
  private readonly subscription: Subscription;
  private state: LiveStoreState;
  private initialized = false;

  constructor(private readonly env: AppEnv) {
    const dir = resolve(env.LIVE_DATA_DIR);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.storePath = resolve(dir, `${env.LIVE_CUSTOMER_ID}.store.json`);
    this.tenant = {
      id: `tenant-${env.LIVE_CUSTOMER_ID}`,
      azureTenantId: env.LIVE_TENANT_ID,
      primaryDomain: env.LIVE_TENANT_DOMAIN,
      licenseTier: 'Live Microsoft 365 / Purview Tenant',
      region: 'Cloud',
    };
    this.customer = {
      id: env.LIVE_CUSTOMER_ID,
      tenantId: this.tenant.id,
      name: env.LIVE_CUSTOMER_NAME,
      industry: 'Connected Microsoft 365 Tenant',
      serviceTier: 'Managed Purview Enterprise',
      primaryContactEmail: `secops@${env.LIVE_TENANT_DOMAIN}`,
      isDemo: false,
    };
    this.subscription = {
      id: `sub-${env.LIVE_CUSTOMER_ID}`,
      customerId: env.LIVE_CUSTOMER_ID,
      planName: 'Connected Live Tenant',
      licensedSeats: 0,
      purviewModulesEnabled: ['DLP', 'Information Protection', 'Insider Risk', 'Audit', 'Security Alerts v2'],
    };

    if (existsSync(this.storePath)) {
      this.state = JSON.parse(readFileSync(this.storePath, 'utf8')) as LiveStoreState;
    } else {
      this.state = { snapshots: [], recommendations: [], collectionRuns: [] };
    }
  }

  private persist(): void {
    writeFileSync(this.storePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  public async ensureInitialCollection(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    if (this.state.snapshots.length === 0) {
      await this.triggerLiveCollection(this.customer.id, undefined, 'InitialStartupSync');
    }
  }

  public async triggerLiveCollection(
    customerId: string,
    periodId?: string,
    triggeredBy = 'ManualPortalSync',
  ): Promise<CollectionRun | null> {
    if (customerId !== this.customer.id) return null;
    const output = await runLiveTenantCollection({
      customerId: this.customer.id,
      tenantEntityId: this.tenant.id,
      azureTenantId: this.env.LIVE_TENANT_ID,
      periodId,
      triggeredBy,
      clientId: this.env.GRAPH_CLIENT_ID,
      clientSecret: this.env.GRAPH_CLIENT_SECRET,
      enableBeta: this.env.ENABLE_BETA_CONNECTORS,
      powershellSnapshotDir: this.env.POWERSHELL_SNAPSHOT_DIR,
      sentinelWorkspaceId: this.env.SENTINEL_WORKSPACE_ID,
    });

    await this.saveSnapshot(output.snapshot);
    for (const rec of output.recommendations) {
      if (!this.state.recommendations.some((r) => r.id === rec.id)) {
        this.state.recommendations.push(rec);
      }
    }
    await this.saveCollectionRun(output.run);
    this.persist();
    return output.run;
  }

  async listCustomers(): Promise<Customer[]> {
    await this.ensureInitialCollection();
    return [this.customer];
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    await this.ensureInitialCollection();
    return customerId === this.customer.id ? this.customer : null;
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return tenantId === this.tenant.id ? this.tenant : null;
  }

  async getSubscription(customerId: string): Promise<Subscription | null> {
    return customerId === this.customer.id ? this.subscription : null;
  }

  async listSnapshots(customerId: string): Promise<MonthlySnapshot[]> {
    await this.ensureInitialCollection();
    if (customerId !== this.customer.id) return [];
    return [...this.state.snapshots].sort((a, b) => a.period.periodId.localeCompare(b.period.periodId));
  }

  async getSnapshot(customerId: string, periodId?: string): Promise<MonthlySnapshot | null> {
    const list = await this.listSnapshots(customerId);
    if (list.length === 0) return null;
    if (!periodId) return list[list.length - 1] ?? null;
    return list.find((s) => s.period.periodId === periodId) ?? null;
  }

  async saveSnapshot(snapshot: MonthlySnapshot): Promise<void> {
    const idx = this.state.snapshots.findIndex(
      (s) => s.customerId === snapshot.customerId && s.period.periodId === snapshot.period.periodId,
    );
    if (idx >= 0) {
      this.state.snapshots[idx] = snapshot;
    } else {
      this.state.snapshots.push(snapshot);
    }
    this.persist();
  }

  async listRecommendations(customerId: string): Promise<Recommendation[]> {
    await this.ensureInitialCollection();
    return this.state.recommendations.filter((r) => r.customerId === customerId);
  }

  async updateRecommendationStatus(
    customerId: string,
    recommendationId: string,
    status: RecommendationStatus,
  ): Promise<Recommendation | null> {
    const rec = this.state.recommendations.find(
      (r) => r.customerId === customerId && r.id === recommendationId,
    );
    if (!rec) return null;
    rec.status = status;
    rec.lastReviewed = new Date().toISOString().slice(0, 10);
    this.persist();
    return rec;
  }

  async addManagedServiceActivity(activity: ManagedServiceActivity): Promise<ManagedServiceActivity | null> {
    const snap = await this.getSnapshot(activity.customerId, activity.periodId);
    if (!snap) return null;
    snap.managedServiceValue = applyNewActivityToSummary(snap.managedServiceValue, activity);
    this.persist();
    return activity;
  }

  async listCollectionRuns(customerId: string): Promise<CollectionRun[]> {
    await this.ensureInitialCollection();
    return this.state.collectionRuns
      .filter((r) => r.customerId === customerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async saveCollectionRun(run: CollectionRun): Promise<void> {
    this.state.collectionRuns.unshift(run);
    this.persist();
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
