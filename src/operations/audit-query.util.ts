import { Brackets, type SelectQueryBuilder } from 'typeorm';
import type { AuditLogEntity } from './operations.entity';
import type { AuditQueryDto } from './operations.dto';

/** Sheet2 #58/59 — map UI module labels to stored resourceType tokens. */
const MODULE_RESOURCE_HINTS: Record<string, string[]> = {
  'generate code': ['code', 'codes', 'code_batch', 'batch', 'generate'],
  'manage codes': ['code', 'codes', 'verification_code', 'batch', 'manage'],
  products: ['product', 'products'],
  team: ['user', 'team', 'invitation', 'member'],
  reports: ['report', 'reports', 'analytics'],
  settings: ['settings', 'organization', 'profile', 'password', 'security'],
  login: ['login', 'auth', 'session', 'authentication'],
  authentication: ['login', 'auth', 'session', 'authentication'],
  vendors: ['vendor', 'organization', 'onboarding'],
  verification: ['verification', 'verify', 'scan'],
};

/**
 * Date-only audit filters represent calendar days in the portal. Expand the
 * upper boundary to the end of that day; `new Date('YYYY-MM-DD')` otherwise
 * resolves to midnight and hides every event recorded later that day.
 */
export function auditDateBoundary(
  value: string,
  boundary: 'from' | 'to',
): Date {
  const date = new Date(value);
  if (boundary === 'to' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

/**
 * Apply agreed Audit Log filters: date/time, actor, module, action, status, search.
 */
export function applyAuditListFilters(
  qb: SelectQueryBuilder<AuditLogEntity>,
  q: AuditQueryDto,
  options: { includeOrganizationSearch?: boolean } = {},
): SelectQueryBuilder<AuditLogEntity> {
  if (q.actorId) {
    qb.andWhere('audit.actorId = :actorId', { actorId: q.actorId });
  }

  if (q.actor?.trim()) {
    const actor = `%${q.actor.trim().toLowerCase()}%`;
    qb.andWhere(
      new Brackets((where) => {
        where
          .where(
            `LOWER(CONCAT(COALESCE(actor.firstName, ''), ' ', COALESCE(actor.lastName, ''))) LIKE :actor`,
            { actor },
          )
          .orWhere('LOWER(actor.email) LIKE :actor', { actor });
      }),
    );
  }

  if (q.action?.trim()) {
    const actionNeedle = `%${q.action.trim().toLowerCase().replace(/\s+/g, '%')}%`;
    qb.andWhere('LOWER(audit.action) LIKE :actionNeedle', { actionNeedle });
  }

  if (q.resourceType?.trim()) {
    const label = q.resourceType.trim().toLowerCase();
    const hints = MODULE_RESOURCE_HINTS[label];
    if (hints?.length) {
      qb.andWhere(
        new Brackets((where) => {
          hints.forEach((hint, index) => {
            const key = `moduleHint${index}`;
            const clause = `LOWER(audit.resourceType) LIKE :${key}`;
            if (index === 0) where.where(clause, { [key]: `%${hint}%` });
            else where.orWhere(clause, { [key]: `%${hint}%` });
          });
          where.orWhere('LOWER(audit.resourceType) LIKE :moduleExact', {
            moduleExact: `%${label}%`,
          });
        }),
      );
    } else {
      qb.andWhere('LOWER(audit.resourceType) LIKE :resourceType', {
        resourceType: `%${label}%`,
      });
    }
  }

  if (q.resourceId) {
    qb.andWhere('audit.resourceId = :resourceId', { resourceId: q.resourceId });
  }

  if (q.status) {
    qb.andWhere('audit.status = :status', { status: q.status });
  }

  if (q.from) {
    qb.andWhere('audit.createdAt >= :from', {
      from: auditDateBoundary(q.from, 'from'),
    });
  }

  if (q.to) {
    qb.andWhere('audit.createdAt <= :to', {
      to: auditDateBoundary(q.to, 'to'),
    });
  }

  if (q.search?.trim()) {
    const search = `%${q.search.trim().toLowerCase()}%`;
    qb.andWhere(
      new Brackets((where) => {
        where
          .where('LOWER(audit.action) LIKE :search', { search })
          .orWhere('LOWER(audit.resourceType) LIKE :search', { search })
          .orWhere(`LOWER(COALESCE(audit.resourceId, '')) LIKE :search`, {
            search,
          })
          .orWhere('LOWER(actor.firstName) LIKE :search', { search })
          .orWhere('LOWER(actor.lastName) LIKE :search', { search })
          .orWhere('LOWER(actor.email) LIKE :search', { search });
        if (options.includeOrganizationSearch) {
          where.orWhere('LOWER(org.companyName) LIKE :search', { search });
        }
      }),
    );
  }

  return qb;
}

export function mapAuditRowMetadata(row: AuditLogEntity) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    ipAddress:
      typeof metadata.ipAddress === 'string' ? metadata.ipAddress : undefined,
    location:
      typeof metadata.location === 'string' ? metadata.location : undefined,
    userAgent:
      typeof metadata.userAgent === 'string' ? metadata.userAgent : undefined,
    device: typeof metadata.device === 'string' ? metadata.device : undefined,
    sessionId:
      typeof metadata.sessionId === 'string' ? metadata.sessionId : undefined,
    authority:
      typeof metadata.authority === 'string' ? metadata.authority : undefined,
    details:
      typeof metadata.details === 'string' ? metadata.details : undefined,
    metadata,
  };
}
