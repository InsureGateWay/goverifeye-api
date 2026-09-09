import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { ProductEntity } from '../products/product.entity';
import {
  VerificationCodeEntity,
  VerificationEventEntity,
} from './code.entity';
import { FraudCaseEntity } from '../governance/governance.entity';
import type { AnomalyCategory, AnomalySeverity } from './anomaly-detection.service';

const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000000';

const NIGERIA_LOCATION =
  /nigeria|lagos|kano|abuja|port harcourt|phc|aba|warri|enugu|ibadan|kaduna|calabar|benin city|jos|ilorin|onitsha|uyo|owerri|sokoto|maiduguri/i;

/** Sheet2 Anomaly Processing — catalog of instant vs background rules for Admin. */
export const ANOMALY_DETECTION_CATALOG = {
  instant: [
    {
      key: 'high_frequency',
      label: 'High-frequency scans on one code (10 min)',
      surfacesAs: 'Automated scanning',
    },
    {
      key: 'ip_burst',
      label: 'Same IP burst (10 min)',
      surfacesAs: 'Automated scanning',
    },
    {
      key: 'repeat_scan',
      label: 'Repeat verification of an already-scanned code',
      surfacesAs: 'Possible cloning',
    },
    {
      key: 'multi_region',
      label: 'Same code in 2+ locations within 2 hours',
      surfacesAs: 'Possible cloning',
    },
    {
      key: 'geographic_anomaly',
      label: 'Single scan outside Nigeria scope',
      surfacesAs: 'Geographic anomaly',
    },
    {
      key: 'customer_complaint',
      label: 'Counterfeit / complaint signal on scan',
      surfacesAs: 'Customer complaint',
    },
    {
      key: 'suspicious_product_rate',
      label: 'Product already has elevated suspicious share',
      surfacesAs: 'Suspicious / fake product',
    },
  ],
  background: [
    {
      key: 'code_velocity_24h',
      label: 'Accumulated velocity: ≥40 scans on one code in 24 hours',
      surfacesAs: 'Automated scanning',
    },
    {
      key: 'multi_region_24h',
      label: 'Accumulated cloning: ≥3 distinct locations on one code in 24 hours',
      surfacesAs: 'Possible cloning',
    },
    {
      key: 'ip_code_fanout_24h',
      label: 'Bot-like fan-out: one IP hits ≥15 distinct codes in 24 hours',
      surfacesAs: 'Automated scanning',
    },
    {
      key: 'cross_border_24h',
      label: 'Accumulated geo mix: Nigeria + out-of-scope locations on one code in 24 hours',
      surfacesAs: 'Geographic anomaly',
    },
    {
      key: 'product_suspicion_7d',
      label: 'Product suspicious share ≥30% with ≥50 scans (rolling profile)',
      surfacesAs: 'Suspicious / fake product',
    },
  ],
} as const;

type BackgroundFinding = {
  organizationId: string;
  category: AnomalyCategory;
  severity: AnomalySeverity;
  title: string;
  description: string;
  codeHint: string;
  verificationEventId?: string | null;
  signals: Record<string, unknown>;
};

/**
 * Sheet2 Anomaly Processing — scheduled analysis of accumulated scan activity.
 * Instant rules stay in AnomalyDetectionService (per-scan). This worker finds
 * patterns that only appear after many events land in the database.
 */
@Injectable()
export class AnomalyProcessingService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AnomalyProcessingService.name);
  private timer?: NodeJS.Timeout;
  private bootTimer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly db: DataSource) {}

  onApplicationBootstrap() {
    if (process.env.ANOMALY_WORKER_ENABLED === 'false') return;
    const intervalMs = Number(process.env.ANOMALY_POLL_INTERVAL_MS ?? 15 * 60_000);
    this.bootTimer = setTimeout(() => void this.runOnce(), 20_000);
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.logger.log(
      `Anomaly background worker enabled; interval=${intervalMs}ms`,
    );
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    if (this.bootTimer) clearTimeout(this.bootTimer);
  }

  /** Admin / ops trigger for an immediate background pass. */
  async runOnce(): Promise<{ findings: number; openedOrUpdated: number }> {
    if (this.running) return { findings: 0, openedOrUpdated: 0 };
    this.running = true;
    try {
      const findings = await this.collectFindings();
      let openedOrUpdated = 0;
      for (const finding of findings) {
        await this.upsertFraudCase(finding);
        openedOrUpdated += 1;
      }
      if (findings.length) {
        this.logger.log(
          `Background anomaly pass complete findings=${findings.length} alertsTouched=${openedOrUpdated}`,
        );
      }
      return { findings: findings.length, openedOrUpdated };
    } catch (error) {
      this.logger.error(
        `Background anomaly pass failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { findings: 0, openedOrUpdated: 0 };
    } finally {
      this.running = false;
    }
  }

  private async collectFindings(): Promise<BackgroundFinding[]> {
    const since24h = new Date(Date.now() - 24 * 60 * 60_000);
    const findings: BackgroundFinding[] = [];

    const codeVelocity = await this.db
      .getRepository(VerificationEventEntity)
      .createQueryBuilder('e')
      .select('e.codeId', 'codeId')
      .addSelect('e.organizationId', 'organizationId')
      .addSelect('COUNT(*)', 'scans')
      .addSelect('MAX(e.id)', 'lastEventId')
      .where('e.createdAt > :since', { since: since24h })
      .groupBy('e.codeId')
      .addGroupBy('e.organizationId')
      .having('COUNT(*) >= :min', { min: 40 })
      .getRawMany<{
        codeId: string;
        organizationId: string;
        scans: string;
        lastEventId: string;
      }>();

    for (const row of codeVelocity) {
      const hint = await this.codeHint(row.codeId);
      findings.push({
        organizationId: row.organizationId,
        category: 'Automated scanning',
        severity: Number(row.scans) >= 80 ? 'critical' : 'high',
        title: `Automated scanning: ${hint}`,
        description: `Background processing detected ${row.scans} scans on one code within 24 hours.`,
        codeHint: hint,
        verificationEventId: row.lastEventId,
        signals: {
          detectionMode: 'background',
          rule: 'code_velocity_24h',
          scans24h: Number(row.scans),
          codeId: row.codeId,
        },
      });
    }

    const multiRegion = await this.db
      .getRepository(VerificationEventEntity)
      .createQueryBuilder('e')
      .select('e.codeId', 'codeId')
      .addSelect('e.organizationId', 'organizationId')
      .addSelect(`COUNT(DISTINCT COALESCE(NULLIF(e.location, ''), 'Unknown'))`, 'locations')
      .addSelect('MAX(e.id)', 'lastEventId')
      .where('e.createdAt > :since', { since: since24h })
      .andWhere(`COALESCE(NULLIF(e.location, ''), '') <> ''`)
      .groupBy('e.codeId')
      .addGroupBy('e.organizationId')
      .having(`COUNT(DISTINCT COALESCE(NULLIF(e.location, ''), 'Unknown')) >= :min`, {
        min: 3,
      })
      .getRawMany<{
        codeId: string;
        organizationId: string;
        locations: string;
        lastEventId: string;
      }>();

    for (const row of multiRegion) {
      const hint = await this.codeHint(row.codeId);
      findings.push({
        organizationId: row.organizationId,
        category: 'Possible cloning',
        severity: Number(row.locations) >= 5 ? 'critical' : 'high',
        title: `Possible cloning: ${hint}`,
        description: `Background processing found the same code across ${row.locations} locations in 24 hours.`,
        codeHint: hint,
        verificationEventId: row.lastEventId,
        signals: {
          detectionMode: 'background',
          rule: 'multi_region_24h',
          distinctLocations24h: Number(row.locations),
          codeId: row.codeId,
        },
      });
    }

    const ipFanout = await this.db
      .getRepository(VerificationEventEntity)
      .createQueryBuilder('e')
      .select('e.ipAddress', 'ipAddress')
      .addSelect('e.organizationId', 'organizationId')
      .addSelect('COUNT(DISTINCT e.codeId)', 'codes')
      .addSelect('MAX(e.id)', 'lastEventId')
      .where('e.createdAt > :since', { since: since24h })
      .andWhere(`COALESCE(NULLIF(e.ipAddress, ''), '') <> ''`)
      .groupBy('e.ipAddress')
      .addGroupBy('e.organizationId')
      .having('COUNT(DISTINCT e.codeId) >= :min', { min: 15 })
      .getRawMany<{
        ipAddress: string;
        organizationId: string;
        codes: string;
        lastEventId: string;
      }>();

    for (const row of ipFanout) {
      findings.push({
        organizationId: row.organizationId,
        category: 'Automated scanning',
        severity: Number(row.codes) >= 30 ? 'critical' : 'high',
        title: `Automated scanning: IP fan-out`,
        description: `Background processing detected one IP verifying ${row.codes} distinct codes in 24 hours.`,
        codeHint: row.ipAddress.slice(0, 16),
        verificationEventId: row.lastEventId,
        signals: {
          detectionMode: 'background',
          rule: 'ip_code_fanout_24h',
          distinctCodes24h: Number(row.codes),
          ipAddress: row.ipAddress,
        },
      });
    }

    const locationRows = await this.db
      .getRepository(VerificationEventEntity)
      .createQueryBuilder('e')
      .select('e.codeId', 'codeId')
      .addSelect('e.organizationId', 'organizationId')
      .addSelect('e.location', 'location')
      .addSelect('MAX(e.id)', 'lastEventId')
      .where('e.createdAt > :since', { since: since24h })
      .andWhere(`COALESCE(NULLIF(e.location, ''), '') <> ''`)
      .groupBy('e.codeId')
      .addGroupBy('e.organizationId')
      .addGroupBy('e.location')
      .getRawMany<{
        codeId: string;
        organizationId: string;
        location: string;
        lastEventId: string;
      }>();

    const byCode = new Map<
      string,
      { organizationId: string; locations: string[]; lastEventId: string }
    >();
    for (const row of locationRows) {
      const key = `${row.organizationId}::${row.codeId}`;
      const entry = byCode.get(key) ?? {
        organizationId: row.organizationId,
        locations: [],
        lastEventId: row.lastEventId,
      };
      entry.locations.push(row.location);
      entry.lastEventId = row.lastEventId;
      byCode.set(key, entry);
    }

    for (const [key, entry] of byCode) {
      const hasNg = entry.locations.some((loc) => NIGERIA_LOCATION.test(loc));
      const hasExternal = entry.locations.some(
        (loc) => loc.trim() && !NIGERIA_LOCATION.test(loc),
      );
      if (!hasNg || !hasExternal) continue;
      const codeId = key.split('::')[1]!;
      const hint = await this.codeHint(codeId);
      findings.push({
        organizationId: entry.organizationId,
        category: 'Geographic anomaly',
        severity: 'medium',
        title: `Geographic anomaly: ${hint}`,
        description:
          'Background processing found Nigeria and out-of-scope locations on the same code within 24 hours.',
        codeHint: hint,
        verificationEventId: entry.lastEventId,
        signals: {
          detectionMode: 'background',
          rule: 'cross_border_24h',
          locations: entry.locations.slice(0, 8),
          codeId,
        },
      });
    }

    const products = await this.db.getRepository(ProductEntity).find({
      where: {},
      take: 500,
      order: { updatedAt: 'DESC' },
    });
    for (const product of products) {
      if (product.scanned < 50) continue;
      const rate = product.suspicious / Math.max(1, product.scanned);
      if (rate < 0.3) continue;
      findings.push({
        organizationId: product.organizationId,
        category: 'Suspicious / fake product',
        severity: rate >= 0.5 ? 'high' : 'medium',
        title: `Suspicious / fake product: ${product.name}`,
        description: `Background processing flagged product suspicious share ${(rate * 100).toFixed(1)}% across ${product.scanned} scans.`,
        codeHint: product.name.slice(0, 24),
        verificationEventId: null,
        signals: {
          detectionMode: 'background',
          rule: 'product_suspicion_7d',
          productId: product.id,
          scanned: product.scanned,
          suspicious: product.suspicious,
          suspiciousRate: Number(rate.toFixed(3)),
        },
      });
    }

    return findings;
  }

  private async codeHint(codeId: string): Promise<string> {
    const code = await this.db.getRepository(VerificationCodeEntity).findOne({
      where: { id: codeId },
      select: { code: true },
    });
    return code?.code?.slice(0, 8) ?? codeId.slice(0, 8);
  }

  private async upsertFraudCase(finding: BackgroundFinding): Promise<void> {
    const repo = this.db.getRepository(FraudCaseEntity);
    const existing = await repo.findOne({
      where: {
        organizationId: finding.organizationId,
        category: finding.category,
        status: In(['open', 'investigating', 'contained']),
      },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      const signals = existing.signals ?? {};
      // Prefer keeping an open instant case; only refresh when background adds new signal.
      existing.signals = {
        ...signals,
        ...finding.signals,
        lastBackgroundAt: new Date().toISOString(),
        hitCount: Number((signals as { hitCount?: number }).hitCount ?? 1) + 1,
      };
      if (
        finding.severity === 'critical' ||
        (finding.severity === 'high' && existing.severity === 'medium') ||
        (finding.severity === 'high' && existing.severity === 'low')
      ) {
        existing.severity = finding.severity;
      }
      if (finding.verificationEventId) {
        existing.verificationEventId = finding.verificationEventId;
      }
      existing.updatedById = SYSTEM_ACTOR_ID;
      await repo.save(existing);
      return;
    }

    await repo.save(
      repo.create({
        organizationId: finding.organizationId,
        verificationEventId: finding.verificationEventId ?? undefined,
        category: finding.category,
        severity: finding.severity,
        status: 'open',
        title: finding.title,
        description: finding.description,
        signals: {
          ...finding.signals,
          codeHint: finding.codeHint,
          hitCount: 1,
        },
        createdById: SYSTEM_ACTOR_ID,
        updatedById: SYSTEM_ACTOR_ID,
      }),
    );
  }
}
