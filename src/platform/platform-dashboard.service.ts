import { Injectable } from '@nestjs/common';
import { DataSource, In, MoreThanOrEqual, Not } from 'typeorm';
import {
  VerificationCodeEntity,
  VerificationEventEntity,
} from '../codes/code.entity';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { PlatformReportsService } from './platform-reports.service';

const PLATFORM_ORG_NAME = 'goVerifEye Platform Ops';

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function relativeWhen(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const start = startOfToday();
  if (date >= start) return 'Today';
  const yesterday = new Date(start);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date >= yesterday) return 'Yesterday';
  const diffDays = Math.floor(
    (start.getTime() - date.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatVerificationCode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  if (digits.length !== 16) return raw;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}`;
}

function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

@Injectable()
export class PlatformDashboardService {
  constructor(
    private readonly db: DataSource,
    private readonly reports: PlatformReportsService,
  ) {}

  async overview() {
    const reports = await this.reports.overview();
    const orgs = this.db.getRepository(OrganizationEntity);
    const products = this.db.getRepository(ProductEntity);
    const events = this.db.getRepository(VerificationEventEntity);
    const codes = this.db.getRepository(VerificationCodeEntity);
    const today = startOfToday();

    const [
      registeredVendors,
      verifiedProducts,
      verificationsToday,
      invalidScans,
      suspiciousRows,
    ] = await Promise.all([
      orgs.count({
        where: {
          status: 'approved',
          companyName: Not(PLATFORM_ORG_NAME),
        },
      }),
      products.count({ where: { status: ProductStatus.Active } }),
      events.countBy({ createdAt: MoreThanOrEqual(today) }),
      events
        .createQueryBuilder('e')
        .where(`e.outcome != :valid`, { valid: 'valid' })
        .andWhere(`e.outcome != :suspicious`, { suspicious: 'suspicious' })
        .getCount(),
      events.find({
        where: { outcome: 'suspicious' },
        order: { createdAt: 'DESC' },
        take: 8,
      }),
    ]);

    const codeIds = [...new Set(suspiciousRows.map((row) => row.codeId))];
    const codeMap = codeIds.length
      ? new Map(
          (
            await codes.find({
              where: { id: In(codeIds) },
              select: { id: true, code: true },
            })
          ).map((row) => [row.id, row.code]),
        )
      : new Map<string, string>();

    const fraudAlerts = suspiciousRows.map((row) => {
      const code = formatVerificationCode(codeMap.get(row.codeId) ?? row.codeId);
      const detail =
        row.customerComplaint?.trim() ||
        (row.riskReasons?.length
          ? row.riskReasons.join(', ')
          : 'Suspicious scan activity detected');
      return {
        id: row.id,
        title: `Code ${code} flagged`,
        detail,
        when: relativeWhen(row.createdAt),
        severity: (row.riskScore >= 70 ? 'high' : 'medium') as
          | 'high'
          | 'medium',
      };
    });

    const totalCodes = reports.totalCodes;
    const activatedCount = reports.batchStatus.activated;
    const pendingCount = reports.batchStatus.pendingActivation;
    const scannedCount = reports.batchStatus.scanned;

    return {
      summary: {
        registeredVendors,
        verifiedProducts,
        codesGenerated: reports.metrics.codesGenerated,
        verificationsToday,
        suspiciousScans: reports.metrics.suspiciousScans,
      },
      trendTotals: {
        successful: reports.verification.firstTime,
        repeated: reports.verification.repeat,
        invalid: invalidScans,
        total: reports.totalScans,
      },
      topVendors: reports.topVendors,
      fraudAlerts,
      batchStatus: {
        totalCodes,
        activated: {
          count: activatedCount,
          percent: percent(activatedCount, totalCodes),
        },
        pendingActivation: {
          count: pendingCount,
          percent: percent(pendingCount, totalCodes),
        },
        scanned: {
          count: scannedCount,
          percent: percent(scannedCount, totalCodes),
        },
      },
      scanGeo: reports.locations.map((row) => ({
        state: row.state,
        scans: row.scans,
      })),
    };
  }
}
