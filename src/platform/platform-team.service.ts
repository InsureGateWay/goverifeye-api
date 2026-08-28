import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, Raw } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { UserEntity } from '../auth/auth.entity';
import { pageOf } from '../common/api-response';
import { DomainError } from '../common/domain-error';
import { toOrder } from '../common/page-query.dto';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { invitationEmail } from '../operations/email-templates';
import { ReliabilityService } from '../operations/reliability.service';
import {
  InviteMemberDto,
  TeamQueryDto,
  TeamRole,
  UpdateMemberDto,
} from '../team/team.dto';
import { TeamInvitationEntity, TeamMemberEntity } from '../team/team.entity';

const PLATFORM_ORG_NAME = 'goVerifEye Platform Ops';

@Injectable()
export class PlatformTeamService {
  constructor(
    private readonly db: DataSource,
    private readonly reliability: ReliabilityService,
  ) {}

  async resolvePlatformOrganizationId(): Promise<string> {
    const orgs = this.db.getRepository(OrganizationEntity);
    const found = await orgs.findOneBy({ companyName: PLATFORM_ORG_NAME });
    if (found) return found.id;

    const admin = await this.db.getRepository(UserEntity).findOneBy({
      role: 'platform_admin',
    });
    if (!admin) {
      throw new DomainError(
        'Platform organization is not configured. Run seed:platform-admin.',
        'PLATFORM_ORG_NOT_FOUND',
        503,
      );
    }
    return admin.organizationId;
  }

  async metrics() {
    const orgId = await this.resolvePlatformOrganizationId();
    const members = this.db.getRepository(TeamMemberEntity);
    const invitations = this.db.getRepository(TeamInvitationEntity);
    const users = this.db.getRepository(UserEntity);

    const [teamRows, pendingInvites, platformUsers] = await Promise.all([
      members.find({ where: { organizationId: orgId } }),
      invitations.countBy({
        organizationId: orgId,
        revokedAt: IsNull(),
        acceptedAt: IsNull(),
      }),
      users.find({
        where: { organizationId: orgId, role: 'platform_admin' },
      }),
    ]);

    const rows =
      teamRows.length > 0
        ? teamRows
        : platformUsers.map((user) =>
            members.create({
              organizationId: orgId,
              userId: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              role: TeamRole.Admin,
              status: user.isActive ? 'active' : 'inactive',
            }),
          );

    return {
      total: rows.length + pendingInvites,
      active: rows.filter((row) => row.status === 'active').length,
      pending:
        rows.filter((row) => row.status === 'pending').length + pendingInvites,
      inactive: rows.filter((row) => row.status === 'inactive').length,
    };
  }

  async list(query: TeamQueryDto) {
    const orgId = await this.resolvePlatformOrganizationId();
    const members = this.db.getRepository(TeamMemberEntity);

    const qb = members
      .createQueryBuilder('member')
      .where('member.organizationId = :orgId', { orgId });
    if (query.role) qb.andWhere('member.role = :role', { role: query.role });
    if (query.status) {
      qb.andWhere('member.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere(
        `(LOWER(member.email) LIKE :search OR LOWER(member.firstName) LIKE :search OR LOWER(member.lastName) LIKE :search)`,
        { search: `%${query.search.toLowerCase()}%` },
      );
    }
    const order = toOrder(
      query.sortBy,
      query.sortDirection,
      [
        'firstName',
        'lastName',
        'email',
        'role',
        'status',
        'createdAt',
        'updatedAt',
      ] as const,
      'createdAt',
    );
    const sortField = Object.keys(order)[0] ?? 'createdAt';
    qb.orderBy(
      `member.${sortField}`,
      Object.values(order)[0] as 'ASC' | 'DESC',
    );

    let total = await qb.getCount();
    let data = await qb
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getMany();

    if (total === 0) {
      const users = await this.db.getRepository(UserEntity).find({
        where: { organizationId: orgId, role: 'platform_admin' },
        order: { createdAt: 'DESC' },
      });
      const filtered = users.filter((user) => {
        if (query.search) {
          const q = query.search.toLowerCase();
          const hay =
            `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (query.status === 'active' && !user.isActive) return false;
        if (query.status === 'inactive' && user.isActive) return false;
        return true;
      });
      total = filtered.length;
      const start = (query.page - 1) * query.pageSize;
      data = filtered.slice(start, start + query.pageSize).map((user) =>
        members.create({
          id: user.id,
          organizationId: orgId,
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: TeamRole.Admin,
          status: user.isActive ? 'active' : 'inactive',
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }),
      );
    }

    return pageOf(
      data,
      total,
      query.page,
      query.pageSize,
      query.sortBy,
      query.sortDirection,
    );
  }

  async invite(actorId: string, dto: InviteMemberDto) {
    const orgId = await this.resolvePlatformOrganizationId();
    const email = dto.email.trim().toLowerCase();
    const sameEmail = Raw(
      (column) => `LOWER(TRIM(${column})) = :email`,
      { email },
    );

    if (await this.db.getRepository(UserEntity).existsBy({ email: sameEmail })) {
      throw new DomainError(
        'This email already belongs to a registered user',
        'TEAM_EMAIL_ALREADY_REGISTERED',
        409,
      );
    }
    if (
      await this.db.getRepository(TeamInvitationEntity).existsBy({
        email: sameEmail,
        revokedAt: IsNull(),
        acceptedAt: IsNull(),
      })
    ) {
      throw new DomainError(
        'An active invitation has already been sent to this email',
        'TEAM_INVITATION_EXISTS',
        409,
      );
    }

    const token = randomBytes(32).toString('base64url');
    const invitation = await this.db.transaction(async (manager) => {
      const row = await manager.save(
        TeamInvitationEntity,
        manager.create(TeamInvitationEntity, {
          organizationId: orgId,
          ...dto,
          email,
          pendingEmail: email,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          invitedBy: actorId,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        }),
      );
      const link = `${process.env.APP_PUBLIC_URL ?? 'http://localhost:5173'}/first-time-register?token=${encodeURIComponent(token)}`;
      await this.reliability.enqueue(
        manager,
        'email.send',
        'invitation',
        row.id,
        {
          to: row.email,
          ...invitationEmail({
            firstName: row.firstName,
            role: row.role,
            invitationUrl: link,
            expiresInDays: 7,
          }),
        },
      );
      return row;
    });

    return {
      id: invitation.id,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      email: invitation.email,
      role: invitation.role,
      status: 'pending',
      createdAt: invitation.createdAt,
    };
  }

  async update(orgId: string, id: string, dto: UpdateMemberDto) {
    return this.db.transaction(async (manager) => {
      const members = manager.getRepository(TeamMemberEntity);
      const users = manager.getRepository(UserEntity);
      let row = await members.findOneBy({ id, organizationId: orgId });

      if (!row) {
        const user = await users.findOneBy({
          id,
          organizationId: orgId,
          role: 'platform_admin',
        });
        if (!user) {
          throw new DomainError(
            'Team member was not found',
            'MEMBER_NOT_FOUND',
            404,
          );
        }
        row = await members.save(
          members.create({
            organizationId: orgId,
            userId: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: TeamRole.Admin,
            status: user.isActive ? 'active' : 'inactive',
          }),
        );
      }

      Object.assign(row, dto);
      if (row.userId) {
        await users.update(
          { id: row.userId, organizationId: orgId },
          {
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        );
      }
      return members.save(row);
    });
  }

  async deactivate(orgId: string, actorId: string, id: string) {
    return this.db.transaction(async (manager) => {
      const members = manager.getRepository(TeamMemberEntity);
      const users = manager.getRepository(UserEntity);
      let row = await members.findOneBy({ id, organizationId: orgId });

      if (!row) {
        const user = await users.findOneBy({
          id,
          organizationId: orgId,
          role: 'platform_admin',
        });
        if (!user) {
          throw new DomainError(
            'Team member was not found',
            'MEMBER_NOT_FOUND',
            404,
          );
        }
        if (user.id === actorId) {
          throw new DomainError(
            'You cannot deactivate your own account',
            'SELF_DEACTIVATION',
            409,
          );
        }
        user.isActive = false;
        await users.save(user);
        return members.create({
          id: user.id,
          organizationId: orgId,
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: TeamRole.Admin,
          status: 'inactive',
        });
      }

      if (row.userId === actorId) {
        throw new DomainError(
          'You cannot deactivate your own account',
          'SELF_DEACTIVATION',
          409,
        );
      }
      row.status = 'inactive';
      if (row.userId) {
        await users.update(
          { id: row.userId, organizationId: orgId },
          { isActive: false },
        );
      }
      return members.save(row);
    });
  }
}
