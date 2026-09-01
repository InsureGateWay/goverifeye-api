import { Injectable } from '@nestjs/common';
import { DataSource, In, MoreThan, MoreThanOrEqual } from 'typeorm';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { ProductEntity } from '../products/product.entity';
import {
  CodeBatchEntity,
  VerificationCodeEntity,
  VerificationCodeStatus,
  VerificationEventEntity,
} from '../codes/code.entity';

function formatDisplayDateTime(value: Date | string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date}, ${time}`;
}

function formatVerificationCode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  if (digits.length !== 16) return raw;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}`;
}

@Injectable()
export class PlatformReportsService {
  constructor(private readonly db: DataSource) {}

  async overview() {
    const products = this.db.getRepository(ProductEntity);
    const codes = this.db.getRepository(VerificationCodeEntity);
    const events = this.db.getRepository(VerificationEventEntity);
    const batches = this.db.getRepository(CodeBatchEntity);
    const orgs = this.db.getRepository(OrganizationEntity);

    const [
      totalProducts,
      codesGenerated,
      activatedCodes,
      scannedCodes,
      suspiciousScans,
      uniqueCustomersRow,
      funnelGenerated,
      awaitingActivation,
      marketActive,
      topVendorRows,
      topProductRows,
      locationRows,
      suspiciousRows,
      statusRows,
    ] = await Promise.all([
      products.count(),
      codes.count(),
      codes.countBy({ status: VerificationCodeStatus.Active }),
      codes.countBy({ verificationCount: MoreThan(0) }),
      events.countBy({ outcome: 'suspicious' }),
      events
        .createQueryBuilder('e')
        .select(
          'COUNT(DISTINCT COALESCE(e.ipHash, e.ipAddress, e.location))',
          'count',
        )
        .getRawOne<{ count: string }>(),
      batches.sum('quantity', {}),
      codes.countBy({ status: VerificationCodeStatus.Inactive }),
      codes.countBy({ status: VerificationCodeStatus.Active }),
      events
        .createQueryBuilder('e')
        .select('e.organizationId', 'organizationId')
        .addSelect('COUNT(*)', 'scans')
        .groupBy('e.organizationId')
        .orderBy('scans', 'DESC')
        .limit(5)
        .getRawMany<{ organizationId: string; scans: string }>(),
      products.find({
        where: { scanned: MoreThan(0) },
        order: { scanned: 'DESC' },
        take: 5,
      }),
      events
        .createQueryBuilder('e')
        .select(`COALESCE(NULLIF(e.location, ''), 'Unknown')`, 'location')
        .addSelect('COUNT(*)', 'scans')
        .addSelect(
          `SUM(CASE WHEN e.outcome = 'suspicious' THEN 1 ELSE 0 END)`,
          'suspicious',
        )
        .groupBy(`COALESCE(NULLIF(e.location, ''), 'Unknown')`)
        .orderBy('scans', 'DESC')
        .limit(5)
        .getRawMany<{ location: string; scans: string; suspicious: string }>(),
      events.find({
        where: { outcome: 'suspicious' },
        order: { createdAt: 'DESC' },
        take: 100,
      }),
      codes
        .createQueryBuilder('c')
        .select('c.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('c.status')
        .getRawMany<{ status: string; count: string }>(),
    ]);

    const orgIds = topVendorRows.map((row) => row.organizationId);
    const orgMap = new Map(
      orgIds.length
        ? (
            await orgs.find({ where: { id: In(orgIds) } })
          ).map((org) => [org.id, org.companyName || 'Organization'])
        : [],
    );

    const productIds = [
      ...new Set(suspiciousRows.map((row) => row.productId)),
    ];
    const codeIds = [...new Set(suspiciousRows.map((row) => row.codeId))];
    const [productMap, codeMap] = await Promise.all([
      productIds.length
        ? products
            .find({ where: { id: In(productIds) }, select: { id: true, name: true } })
            .then((rows) => new Map(rows.map((p) => [p.id, p.name])))
        : Promise.resolve(new Map<string, string>()),
      codeIds.length
        ? codes
            .find({ where: { id: In(codeIds) }, select: { id: true, code: true } })
            .then((rows) => new Map(rows.map((c) => [c.id, c.code])))
        : Promise.resolve(new Map<string, string>()),
    ]);

    const totalScanEvents = await events.count();
    const repeatScans = await events
      .createQueryBuilder('e')
      .select('e.codeId')
      .groupBy('e.codeId')
      .having('COUNT(*) > 1')
      .getRawMany();
    const firstTimeScans = Math.max(0, totalScanEvents - suspiciousScans);

    const statusCounts = Object.fromEntries(
      statusRows.map((row) => [row.status, Number(row.count)]),
    );
    const activatedBatchCodes = statusCounts.active ?? 0;
    const pendingActivation = statusCounts.inactive ?? 0;

    const topProductsTotal = topProductRows.reduce(
      (sum, product) => sum + product.scanned,
      0,
    );

    return {
      metrics: {
        totalProducts,
        uniqueCustomers: Number(uniqueCustomersRow?.count ?? 0),
        codesGenerated,
        activatedCodes,
        scannedCodes,
        suspiciousScans,
      },
      topVendors: topVendorRows.map((row) => ({
        id: row.organizationId,
        name: orgMap.get(row.organizationId) ?? 'Organization',
        scans: Number(row.scans),
      })),
      topProducts: topProductRows.map((product) => ({
        id: product.id,
        name: product.name,
        scans: product.scanned,
        percent:
          topProductsTotal > 0
            ? Number(((product.scanned / topProductsTotal) * 100).toFixed(1))
            : 0,
      })),
      funnel: {
        generated: Number(funnelGenerated ?? codesGenerated),
        awaitingActivation,
        marketActive,
        scanned: scannedCodes,
        suspicious: suspiciousScans,
      },
      batchStatus: {
        activated: activatedBatchCodes,
        scanned: scannedCodes,
        pendingActivation,
      },
      verification: {
        firstTime: firstTimeScans,
        repeat: repeatScans.length,
        suspicious: suspiciousScans,
      },
      locations: locationRows.map((row) => {
        const scanCount = Number(row.scans);
        const suspiciousCount = Number(row.suspicious);
        return {
          state: row.location,
          scans: scanCount,
          suspicious: suspiciousCount,
          percent:
            totalScanEvents > 0
              ? Math.round((scanCount / totalScanEvents) * 100)
              : 0,
        };
      }),
      totalCodes: codesGenerated,
      totalScans: totalScanEvents,
      alertCount: suspiciousScans,
      suspiciousScans: suspiciousRows.map((row) => ({
        id: row.id,
        code: formatVerificationCode(codeMap.get(row.codeId) ?? row.codeId),
        product: productMap.get(row.productId) ?? 'Unknown product',
        ip: row.ipAddress ?? '—',
        location: row.location ?? '—',
        complaint: row.customerComplaint ?? '—',
        timestamp: formatDisplayDateTime(row.createdAt),
      })),
    };
  }

  async trend() {
    const rows = await this.db
      .getRepository(VerificationEventEntity)
      .createQueryBuilder('event')
      .select("TO_CHAR(DATE_TRUNC('day', event.createdAt), 'YYYY-MM-DD')", 'label')
      .addSelect('COUNT(*)', 'scans')
      .addSelect("SUM(CASE WHEN event.outcome = 'suspicious' THEN 1 ELSE 0 END)", 'suspicious')
      .where("event.createdAt >= CURRENT_TIMESTAMP - INTERVAL '30 days'")
      .groupBy("DATE_TRUNC('day', event.createdAt)")
      .orderBy("DATE_TRUNC('day', event.createdAt)", 'ASC')
      .getRawMany<{ label: string; scans: string; suspicious: string }>();
    return { points: rows.map((row) => ({ label: row.label, scans: Number(row.scans), suspicious: Number(row.suspicious) })) };
  }

  async exportCsv() {
    const report = await this.overview();
    const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const metrics = Object.entries(report.metrics).map(([key,value]) => [key,value].map(esc).join(','));
    return ['metric,value', ...metrics].join('\n');
  }
}
