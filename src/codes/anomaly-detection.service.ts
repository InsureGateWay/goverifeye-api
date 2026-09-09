import { Injectable } from '@nestjs/common';
import { MoreThan, In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { VerificationEventEntity } from './code.entity';
import { FraudCaseEntity } from '../governance/governance.entity';

/** Sheet2 — Anomaly Detection: instant rule reason codes. */
export type AnomalyReason =
  | 'high_frequency'
  | 'ip_burst'
  | 'repeat_scan'
  | 'multi_region'
  | 'geographic_anomaly'
  | 'customer_complaint'
  | 'suspicious_product_rate';

export type AnomalyCategory =
  | 'Possible cloning'
  | 'Automated scanning'
  | 'Geographic anomaly'
  | 'Suspicious / fake product'
  | 'Customer complaint';

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low';

export type AnomalyAssessment = {
  reasons: AnomalyReason[];
  riskScore: number;
  outcome: 'valid' | 'suspicious';
  category: AnomalyCategory;
  severity: AnomalySeverity;
  title: string;
  signals: Record<string, unknown>;
};

const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000000';

const NIGERIA_LOCATION =
  /nigeria|lagos|kano|abuja|port harcourt|phc|aba|warri|enugu|ibadan|kaduna|calabar|benin city|jos|ilorin|onitsha|uyo|owerri|sokoto|maiduguri/i;

function isOutsideNigeria(location?: string): boolean {
  if (!location?.trim()) return false;
  return !NIGERIA_LOCATION.test(location);
}

function primaryCategory(reasons: AnomalyReason[]): AnomalyCategory {
  if (reasons.includes('multi_region') || reasons.includes('repeat_scan')) {
    return 'Possible cloning';
  }
  if (reasons.includes('high_frequency') || reasons.includes('ip_burst')) {
    return 'Automated scanning';
  }
  if (reasons.includes('geographic_anomaly')) return 'Geographic anomaly';
  if (reasons.includes('suspicious_product_rate')) {
    return 'Suspicious / fake product';
  }
  if (reasons.includes('customer_complaint')) return 'Customer complaint';
  return 'Suspicious / fake product';
}

function severityFor(reasons: AnomalyReason[], riskScore: number): AnomalySeverity {
  if (reasons.includes('multi_region') || riskScore >= 90) return 'critical';
  if (reasons.includes('high_frequency') || reasons.includes('ip_burst') || riskScore >= 80) {
    return 'high';
  }
  if (reasons.includes('geographic_anomaly') || riskScore >= 70) return 'medium';
  return 'low';
}

function titleFor(category: AnomalyCategory, codeHint: string): string {
  return `${category}: ${codeHint}`;
}

/**
 * Sheet2 Anomaly Detection — instant rules evaluated on each verification scan.
 * Background / accumulated detection is handled separately (Anomaly Processing).
 */
@Injectable()
export class AnomalyDetectionService {
  /**
   * Instant rules (single scan + short lookback window):
   * - high_frequency: the fifth scan of the same code in 10 minutes → automated
   * - ip_burst: ≥8 scans from same IP in 10 minutes → automated
   * - repeat_scan: the fifth and later verification → cloning signal
   * - multi_region: same code in ≥2 distinct locations within 2 hours → cloning
   * - geographic_anomaly: scan location outside Nigeria scope
   * - customer_complaint: shopper reported issue / counterfeit signal
   * - suspicious_product_rate: product already has elevated suspicious share
   */
  async assessScan(
    manager: EntityManager,
    input: {
      codeId: string;
      organizationId: string;
      productId: string;
      verificationCount: number;
      location?: string;
      ip?: string;
      customerComplaint?: string;
      productScanned: number;
      productSuspicious: number;
      codeHint: string;
    },
  ): Promise<AnomalyAssessment> {
    const now = Date.now();
    const tenMinutesAgo = new Date(now - 10 * 60_000);
    const twoHoursAgo = new Date(now - 2 * 60 * 60_000);
    const events = manager.getRepository(VerificationEventEntity);

    const [recentSameCode, recentSameIp, recentLocations] = await Promise.all([
      events.countBy({
        codeId: input.codeId,
        createdAt: MoreThan(tenMinutesAgo),
      }),
      input.ip
        ? events.countBy({
            organizationId: input.organizationId,
            ipAddress: input.ip,
            createdAt: MoreThan(tenMinutesAgo),
          })
        : Promise.resolve(0),
      events
        .createQueryBuilder('e')
        .select('DISTINCT e.location', 'location')
        .where('e.codeId = :codeId', { codeId: input.codeId })
        .andWhere('e.createdAt > :since', { since: twoHoursAgo })
        .andWhere(`COALESCE(NULLIF(e.location, ''), '') <> ''`)
        .getRawMany<{ location: string }>(),
    ]);

    const reasons: AnomalyReason[] = [];
    let riskScore = 0;

    if (recentSameCode >= 4) {
      reasons.push('high_frequency');
      riskScore += 70;
    } else if (recentSameCode >= 3) {
      riskScore += 35;
    }

    if (input.ip && recentSameIp >= 8) {
      reasons.push('ip_burst');
      riskScore += 55;
    }

    if (input.verificationCount >= 4) {
      reasons.push('repeat_scan');
      riskScore += 20;
    }

    const locationSet = new Set(
      recentLocations.map((row) => row.location.trim().toLowerCase()).filter(Boolean),
    );
    if (input.location?.trim()) {
      locationSet.add(input.location.trim().toLowerCase());
    }
    if (locationSet.size >= 2) {
      reasons.push('multi_region');
      riskScore += 75;
    }

    if (isOutsideNigeria(input.location)) {
      reasons.push('geographic_anomaly');
      riskScore += 40;
    }

    const complaint = input.customerComplaint?.trim().toLowerCase() ?? '';
    if (
      complaint &&
      /counterfeit|fake|clone|expired|unusual|wrong|damaged|complaint|suspicious/.test(
        complaint,
      )
    ) {
      reasons.push('customer_complaint');
      riskScore += 45;
    }

    if (
      input.productScanned >= 20 &&
      input.productSuspicious / Math.max(1, input.productScanned) >= 0.25
    ) {
      reasons.push('suspicious_product_rate');
      riskScore += 30;
    }

    riskScore = Math.min(100, riskScore);
    const outcome: AnomalyAssessment['outcome'] =
      riskScore >= 70 || reasons.includes('multi_region') || reasons.includes('high_frequency')
        ? 'suspicious'
        : 'valid';

    const uniqueReasons = [...new Set(reasons)];
    const category = primaryCategory(uniqueReasons);
    const severity = severityFor(uniqueReasons, riskScore);

    return {
      reasons: uniqueReasons,
      riskScore,
      outcome,
      category,
      severity,
      title: titleFor(category, input.codeHint),
      signals: {
        detectionMode: 'instant',
        recentSameCode,
        recentSameIp,
        distinctLocations: [...locationSet],
        location: input.location ?? null,
        ipPresent: Boolean(input.ip),
        productSuspiciousRate:
          input.productScanned > 0
            ? Number((input.productSuspicious / input.productScanned).toFixed(3))
            : 0,
      },
    };
  }

  /** Surface suspicious instant detections into Admin Fraud Alerts queue. */
  async openAdminAlert(
    manager: EntityManager,
    input: {
      organizationId: string;
      verificationEventId: string;
      assessment: AnomalyAssessment;
      codeHint: string;
    },
  ): Promise<void> {
    if (input.assessment.outcome !== 'suspicious') return;

    const repo = manager.getRepository(FraudCaseEntity);
    const existing = await repo.findOne({
      where: {
        organizationId: input.organizationId,
        category: input.assessment.category,
        status: In(['open', 'investigating', 'contained']),
      },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      existing.signals = {
        ...(existing.signals ?? {}),
        ...input.assessment.signals,
        lastEventId: input.verificationEventId,
        lastReasons: input.assessment.reasons,
        lastRiskScore: input.assessment.riskScore,
        hitCount: Number((existing.signals as { hitCount?: number })?.hitCount ?? 1) + 1,
      };
      existing.severity = input.assessment.severity;
      existing.verificationEventId = input.verificationEventId;
      existing.updatedById = SYSTEM_ACTOR_ID;
      await repo.save(existing);
      return;
    }

    await repo.save(
      repo.create({
        organizationId: input.organizationId,
        verificationEventId: input.verificationEventId,
        category: input.assessment.category,
        severity: input.assessment.severity,
        status: 'open',
        title: input.assessment.title,
        description: `Instant anomaly detection flagged ${input.codeHint}. Reasons: ${input.assessment.reasons.join(', ') || 'none'}.`,
        signals: {
          ...input.assessment.signals,
          codeHint: input.codeHint,
          reasons: input.assessment.reasons,
          hitCount: 1,
        },
        createdById: SYSTEM_ACTOR_ID,
        updatedById: SYSTEM_ACTOR_ID,
      }),
    );
  }
}
