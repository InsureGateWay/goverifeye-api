import { Injectable } from '@nestjs/common';
import {
  DataSource,
  ILike,
  In,
  MoreThan,
  MoreThanOrEqual,
} from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import { pageOf } from '../common/api-response';
import { DomainError } from '../common/domain-error';
import { toOrder } from '../common/page-query.dto';
import {
  BatchStatus,
  CodeBatchEntity,
  VerificationCodeEntity,
  VerificationCodeStatus,
  VerificationEventEntity,
} from '../codes/code.entity';
import { CodeQueryDto } from '../codes/code.dto';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { ProductEntity } from '../products/product.entity';
import { RequestContext } from '../common/request-context';
import { AuditLogEntity } from '../operations/operations.entity';

function formatBatchRef(batchId: string, createdAt?: Date | string): string {
  const digits = batchId.replace(/\D/g, '');
  const seq = (digits.slice(-3) || '001').padStart(3, '0');
  let yymmdd = '';
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      const yy = String(d.getFullYear()).slice(-2);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      yymmdd = `${yy}${mm}${dd}`;
    }
  }
  if (!yymmdd) {
    const fromId = digits.slice(0, 6);
    yymmdd = fromId.length === 6 ? fromId : '260801';
  }
  return `B-${yymmdd}-${seq}`;
}

function formatDisplayDate(value?: Date | string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDisplayDateTime(value?: Date | string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = formatDisplayDate(d);
  const time = d.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date}; ${time}`;
}

@Injectable()
export class PlatformManageCodesService {
  constructor(private readonly db: DataSource) {}

  async getMetrics() {
    const codeRepo = this.db.getRepository(VerificationCodeEntity);
    const [codesGenerated, activatedCodes, pendingActivation, scannedCodes] =
      await Promise.all([
        codeRepo.count(),
        codeRepo.countBy({ status: VerificationCodeStatus.Active }),
        codeRepo.countBy({ status: VerificationCodeStatus.Inactive }),
        codeRepo.countBy({ verificationCount: MoreThan(0) }),
      ]);
    return {
      codesGenerated,
      activatedCodes,
      pendingActivation,
      scannedCodes,
    };
  }

  async listBatches() {
    const batches = await this.db
      .getRepository(CodeBatchEntity)
      .find({
        order: { createdAt: 'DESC' },
        take: 200,
      });

    const orgIds = [...new Set(batches.map((b) => b.organizationId))];
    const productIds = [...new Set(batches.map((b) => b.productId))];

    const [orgs, products, activationRows] = await Promise.all([
      orgIds.length
        ? this.db
            .getRepository(OrganizationEntity)
            .find({ where: { id: In(orgIds) } })
        : [],
      productIds.length
        ? this.db.getRepository(ProductEntity).find({ where: { id: In(productIds) } })
        : [],
      batches.length
        ? this.db
            .getRepository(VerificationCodeEntity)
            .createQueryBuilder('code')
            .select('code.batchId', 'batchId')
            .addSelect('COUNT(*)', 'total')
            .addSelect(
              `SUM(CASE WHEN code.status = 'active' THEN 1 ELSE 0 END)`,
              'active',
            )
            .where('code.batchId IN (:...ids)', {
              ids: batches.map((b) => b.id),
            })
            .groupBy('code.batchId')
            .getRawMany<{ batchId: string; total: string; active: string }>()
        : [],
    ]);

    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const productMap = new Map(products.map((p) => [p.id, p]));
    const activationMap = new Map(
      activationRows.map((row) => [
        row.batchId,
        {
          total: Number(row.total ?? 0),
          active: Number(row.active ?? 0),
        },
      ]),
    );

    return batches.map((batch) => {
      const org = orgMap.get(batch.organizationId);
      const product = productMap.get(batch.productId);
      const activation = activationMap.get(batch.id);
      const total = activation?.total ?? 0;
      const active = activation?.active ?? 0;
      const isActivated = total > 0 && active === total;

      return {
        id: batch.id,
        batchId: formatBatchRef(batch.id, batch.createdAt),
        vendorId: batch.organizationId,
        vendorName: org?.companyName || 'Organization',
        vendorEmail: org?.administrator?.email || '—',
        productName: product?.name || '—',
        labelType: batch.labelType,
        totalCodes: batch.quantity,
        activeCodes: total > 0 ? active : null,
        date: formatDisplayDate(batch.createdAt),
        status: isActivated ? 'activated' : 'generated',
        fulfillment: batch.fulfillment,
      };
    });
  }

  private async resolveBatch(batchKey: string) {
    const repo = this.db.getRepository(CodeBatchEntity);
    const byId = await repo.findOneBy({ id: batchKey });
    if (byId) return byId;

    const batches = await repo.find({
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const match = batches.find(
      (batch) =>
        formatBatchRef(batch.id, batch.createdAt) === batchKey ||
        batch.id.startsWith(batchKey),
    );
    if (!match) {
      throw new DomainError('Code batch was not found', 'BATCH_NOT_FOUND', 404);
    }
    return match;
  }

  async getBatch(batchKey: string) {
    const batch = await this.resolveBatch(batchKey);
    const [org, product, user, activation, sampleCode] = await Promise.all([
      this.db
        .getRepository(OrganizationEntity)
        .findOneBy({ id: batch.organizationId }),
      this.db.getRepository(ProductEntity).findOneBy({
        id: batch.productId,
        organizationId: batch.organizationId,
      }),
      this.db.getRepository(UserEntity).findOneBy({
        id: batch.generatedBy,
        organizationId: batch.organizationId,
      }),
      this.db
        .getRepository(VerificationCodeEntity)
        .createQueryBuilder('code')
        .select('COUNT(*)', 'total')
        .addSelect(
          `SUM(CASE WHEN code.status = 'active' THEN 1 ELSE 0 END)`,
          'active',
        )
        .addSelect('MAX(code.activatedAt)', 'activatedOn')
        .where('code.batchId = :id', { id: batch.id })
        .getRawOne<{ total: string; active: string; activatedOn?: string }>(),
      this.db.getRepository(VerificationCodeEntity).findOne({
        where: { batchId: batch.id, organizationId: batch.organizationId },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const total = Number(activation?.total ?? 0);
    const active = Number(activation?.active ?? 0);
    const isActivated = total > 0 && active === total;
    const generatedBy =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      user?.email ||
      'Vendor user';

    return {
      id: batch.id,
      batchId: formatBatchRef(batch.id, batch.createdAt),
      vendorName: org?.companyName || 'Organization',
      product: product?.name || '—',
      productUnit: product?.form || '—',
      labelType: batch.labelType,
      quantity: batch.quantity,
      totalCost: '—',
      fulfillment:
        batch.fulfillment === 'preprinted' ? 'Pre-printing' : 'Self-printing',
      generatedBy,
      generatedAt: formatDisplayDateTime(batch.createdAt),
      activatedAt:
        isActivated && activation?.activatedOn
          ? formatDisplayDateTime(activation.activatedOn)
          : null,
      status: isActivated ? 'Activated' : 'Generated',
      previewCode: sampleCode?.code ?? 'SAMPLE CODE',
    };
  }

  async listCodes(batchKey: string, query: CodeQueryDto) {
    const batch = await this.resolveBatch(batchKey);
    const repo = this.db.getRepository(VerificationCodeEntity);
    const search = query.search?.trim();
    const where = {
      organizationId: batch.organizationId,
      batchId: batch.id,
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { code: ILike(`%${search}%`) } : {}),
      ...(query.verificationCountMin !== undefined
        ? { verificationCount: MoreThanOrEqual(query.verificationCountMin) }
        : {}),
    };
    const order = toOrder(
      query.sortBy,
      query.sortDirection,
      [
        'code',
        'status',
        'createdAt',
        'activatedAt',
        'verificationCount',
        'lastVerifiedAt',
      ] as const,
      'createdAt',
    );
    const [rows, total] = await repo.findAndCount({
      where,
      order,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    const ids = rows.map((row) => row.id);
    const events =
      ids.length > 0
        ? await this.db
            .getRepository(VerificationEventEntity)
            .createQueryBuilder('event')
            .select('event.codeId', 'codeId')
            .addSelect('MIN(event.createdAt)', 'firstVerifiedAt')
            .addSelect(
              `SUM(CASE WHEN event.outcome = 'suspicious' THEN 1 ELSE 0 END)`,
              'suspiciousScans',
            )
            .where('event.codeId IN (:...ids)', { ids })
            .groupBy('event.codeId')
            .getRawMany<{
              codeId: string;
              firstVerifiedAt: string;
              suspiciousScans: string;
            }>()
        : [];
    const eventMap = new Map(events.map((row) => [row.codeId, row]));

    return pageOf(
      rows.map((row) => {
        const event = eventMap.get(row.id);
        const hasScans = row.verificationCount > 0;
        return {
          code: row.code,
          status: row.status === VerificationCodeStatus.Active ? 'active' : 'inactive',
          scans: hasScans ? row.verificationCount : null,
          suspicious: hasScans
            ? Number(event?.suspiciousScans ?? 0)
            : null,
          firstVerified: event?.firstVerifiedAt
            ? formatDisplayDateTime(event.firstVerifiedAt)
            : null,
          lastVerified: row.lastVerifiedAt
            ? formatDisplayDateTime(row.lastVerifiedAt)
            : null,
        };
      }),
      total,
      query.page,
      query.pageSize,
      query.sortBy,
      query.sortDirection,
    );
  }

  async exportBatchCsv(batchKey: string) {
    const batch = await this.resolveBatch(batchKey);
    const repo = this.db.getRepository(VerificationCodeEntity);
    const rows = await repo.find({
      where: {
        organizationId: batch.organizationId,
        batchId: batch.id,
      },
      order: { code: 'ASC' },
    });

    const ids = rows.map((row) => row.id);
    const events =
      ids.length > 0
        ? await this.db
            .getRepository(VerificationEventEntity)
            .createQueryBuilder('event')
            .select('event.codeId', 'codeId')
            .addSelect('MIN(event.createdAt)', 'firstVerifiedAt')
            .addSelect(
              `SUM(CASE WHEN event.outcome = 'suspicious' THEN 1 ELSE 0 END)`,
              'suspiciousScans',
            )
            .where('event.codeId IN (:...ids)', { ids })
            .groupBy('event.codeId')
            .getRawMany<{
              codeId: string;
              firstVerifiedAt: string;
              suspiciousScans: string;
            }>()
        : [];
    const eventMap = new Map(events.map((row) => [row.codeId, row]));
    const batchRef = formatBatchRef(batch.id, batch.createdAt);
    const escape = (value: unknown) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;

    const lines = rows.map((row) => {
      const event = eventMap.get(row.id);
      const hasScans = row.verificationCount > 0;
      const status =
        row.status === VerificationCodeStatus.Active ? 'active' : row.status;
      return [
        batchRef,
        row.code,
        status,
        hasScans ? row.verificationCount : '',
        hasScans ? Number(event?.suspiciousScans ?? 0) : '',
        event?.firstVerifiedAt
          ? formatDisplayDateTime(event.firstVerifiedAt)
          : '',
        row.lastVerifiedAt ? formatDisplayDateTime(row.lastVerifiedAt) : '',
      ]
        .map(escape)
        .join(',');
    });

    const csv = [
      'batchId,code,status,scans,suspicious,firstVerified,lastVerified',
      ...lines,
    ].join('\n');

    return {
      csv,
      filename: `${batchRef}.csv`,
    };
  }

  async activateBatch(batchKey: string, user: RequestContext) {
    const batch = await this.resolveBatch(batchKey);
    return this.db.transaction(async (manager) => {
      const now = new Date();
      const result = await manager
        .createQueryBuilder()
        .update(VerificationCodeEntity)
        .set({ status: VerificationCodeStatus.Active, activatedAt: now, activatedBy: user.userId })
        .where('"batchId" = :batchId', { batchId: batch.id })
        .andWhere('status = :status', { status: VerificationCodeStatus.Inactive })
        .execute();
      await manager.save(AuditLogEntity, manager.create(AuditLogEntity, {
        organizationId: user.organizationId, actorId: user.userId,
        action: 'platform.batch.activated', resourceType: 'code_batch', resourceId: batch.id,
        status: 'success', metadata: { activatedCodes: result.affected ?? 0 },
      }));
      return { batchId: batch.id, activatedCodes: result.affected ?? 0, activatedAt: now };
    });
  }
}
