import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import { pageOf } from '../common/api-response';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { AuditLogEntity } from '../operations/operations.entity';
import {
  AuditQueryDto,
  AuditSummaryQueryDto,
} from '../operations/operations.dto';
import {
  applyAuditListFilters,
  mapAuditRowMetadata,
} from '../operations/audit-query.util';

@Injectable()
export class PlatformAuditLogsService {
  constructor(private readonly db: DataSource) {}

  async list(q: AuditQueryDto) {
    const qb = this.db
      .getRepository(AuditLogEntity)
      .createQueryBuilder('audit')
      .leftJoin(
        UserEntity,
        'actor',
        'actor.id = audit.actorId AND actor.organizationId = audit.organizationId',
      )
      .leftJoin(
        OrganizationEntity,
        'org',
        'org.id = audit.organizationId',
      )
      .addSelect([
        'actor.firstName',
        'actor.lastName',
        'actor.email',
        'actor.profileImageUrl',
      ])
      .addSelect(['org.companyName']);

    // Sheet2 #58/59 — date/time, users, modules, actions, status (+ search).
    applyAuditListFilters(qb, q, { includeOrganizationSearch: true });

    const sort = new Set(['createdAt', 'action', 'resourceType', 'status']).has(
      q.sortBy,
    )
      ? q.sortBy
      : 'createdAt';
    qb.orderBy(`audit.${sort}`, q.sortDirection.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('audit.id', q.sortDirection.toUpperCase() as 'ASC' | 'DESC');

    const total = await qb.clone().getCount();
    const { entities, raw } = await qb
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize)
      .getRawAndEntities();

    const data = entities.map((row, index) => {
      const meta = mapAuditRowMetadata(row);
      return {
        ...row,
        actor: {
          firstName: raw[index]?.actor_firstName ?? '',
          lastName: raw[index]?.actor_lastName ?? '',
          email: raw[index]?.actor_email ?? '',
          profileImageUrl: raw[index]?.actor_profileImageUrl ?? undefined,
        },
        organizationName: raw[index]?.org_companyName ?? undefined,
        ...meta,
      };
    });

    return pageOf(data, total, q.page, q.pageSize, q.sortBy, q.sortDirection);
  }

  async summary(q: AuditSummaryQueryDto) {
    const now = q.to ? new Date(q.to) : new Date();
    const defaultDays =
      q.range === 'monthly' ? 365 : q.range === 'weekly' ? 56 : 30;
    const from = q.from
      ? new Date(q.from)
      : new Date(now.getTime() - defaultDays * 86400000);

    const repo = this.db.getRepository(AuditLogEntity);
    const rows = await repo
      .createQueryBuilder('audit')
      .select([
        'audit.createdAt',
        'audit.actorId',
        'audit.action',
        'audit.resourceType',
        'audit.status',
      ])
      .where('audit.createdAt BETWEEN :from AND :to', { from, to: now })
      .getMany();

    const totalActivities = await repo.count();
    const actorCounts = new Map<string, number>();
    for (const row of rows) {
      actorCounts.set(row.actorId, (actorCounts.get(row.actorId) ?? 0) + 1);
    }

    const mostId = [...actorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const most = mostId
      ? await this.db.getRepository(UserEntity).findOneBy({ id: mostId })
      : null;

    const daySpan = Math.max(
      1,
      Math.ceil((now.getTime() - from.getTime()) / 86400000),
    );

    return {
      totalActivities,
      averageLogsPerDay: Number((rows.length / daySpan).toFixed(1)),
      activeUsers: actorCounts.size,
      mostActiveUser: most
        ? `${most.firstName} ${most.lastName}`.trim() || most.email
        : '—',
      failedActions: rows.filter(
        (row) => row.status === 'failed' || row.status === 'error',
      ).length,
      securityChanges: rows.filter((row) =>
        /password|role|access|2fa|security|deactivated/i.test(row.action),
      ).length,
    };
  }
}
