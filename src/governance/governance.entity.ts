import { Column, Entity, Index } from 'typeorm';
import { AuditedEntity } from '../database/audited.entity';

@Entity('organization_change_requests')
@Index(['organizationId', 'status', 'createdAt'])
export class OrganizationChangeRequestEntity extends AuditedEntity {
  @Column('uuid') @Index() organizationId!: string;
  @Column({ type: 'text' }) details!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) requestedChanges!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 24, default: 'pending' }) status!: string;
  @Column({ type: 'text', nullable: true }) reviewNotes?: string | null;
  @Column('uuid', { nullable: true }) reviewedById?: string | null;
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt?: Date | null;
}

@Entity('user_mfa_factors')
@Index(['userId', 'status'])
export class UserMfaFactorEntity extends AuditedEntity {
  @Column('uuid') @Index() userId!: string;
  @Column('uuid') @Index() organizationId!: string;
  @Column({ type: 'varchar', length: 16, default: 'totp' }) type!: string;
  @Column({ type: 'varchar', length: 24, default: 'pending' }) status!: string;
  @Column({ type: 'text' }) encryptedSecret!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) recoveryCodeHashes!: string[];
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt?: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) lastUsedAt?: Date | null;
  @Column({ type: 'int', default: 0 }) failedAttempts!: number;
}

@Entity('mfa_login_challenges')
@Index(['userId', 'consumed', 'expiresAt'])
export class MfaLoginChallengeEntity extends AuditedEntity {
  @Column('uuid') @Index() userId!: string;
  @Column('uuid') @Index() organizationId!: string;
  @Column({ type: 'boolean', default: false }) rememberMe!: boolean;
  @Column({ type: 'boolean', default: false }) consumed!: boolean;
  @Column({ type: 'int', default: 0 }) attempts!: number;
  @Column({ type: 'timestamptz' }) expiresAt!: Date;
}

@Entity('vendor_invitations')
@Index(['email', 'status'])
export class VendorInvitationEntity extends AuditedEntity {
  @Column({ type: 'text' }) vendorName!: string;
  @Column({ type: 'text' }) contactPerson!: string;
  @Column({ type: 'text' }) email!: string;
  @Column({ type: 'varchar', length: 24, default: 'pending' }) status!: string;
  @Column({ type: 'text' }) tokenHash!: string;
  @Column({ type: 'timestamptz' }) expiresAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) acceptedAt?: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt?: Date | null;
}

@Entity('vendor_status_history')
@Index(['organizationId', 'createdAt'])
export class VendorStatusHistoryEntity extends AuditedEntity {
  @Column('uuid') @Index() organizationId!: string;
  @Column({ type: 'varchar', length: 32 }) fromStatus!: string;
  @Column({ type: 'varchar', length: 32 }) toStatus!: string;
  @Column({ type: 'text', nullable: true }) reason?: string | null;
}

@Entity('fraud_cases')
@Index(['status', 'severity', 'createdAt'])
@Index(['organizationId', 'createdAt'])
export class FraudCaseEntity extends AuditedEntity {
  @Column('uuid', { nullable: true }) @Index() organizationId?: string | null;
  @Column('uuid', { nullable: true }) @Index() verificationEventId?: string | null;
  @Column({ type: 'varchar', length: 32 }) category!: string;
  @Column({ type: 'varchar', length: 16 }) severity!: string;
  @Column({ type: 'varchar', length: 24, default: 'open' }) status!: string;
  @Column({ type: 'text' }) title!: string;
  @Column({ type: 'text', nullable: true }) description?: string | null;
  @Column('uuid', { nullable: true }) @Index() assignedToId?: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) signals!: Record<string, unknown>;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt?: Date | null;
}

@Entity('fraud_case_notes')
@Index(['caseId', 'createdAt'])
export class FraudCaseNoteEntity extends AuditedEntity {
  @Column('uuid') @Index() caseId!: string;
  @Column({ type: 'text' }) body!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) evidence!: Array<{ fileName: string; url?: string }>;
}

@Entity('audit_exceptions')
@Index(['status', 'severity', 'createdAt'])
export class AuditExceptionEntity extends AuditedEntity {
  @Column('uuid', { nullable: true }) @Index() auditLogId?: string | null;
  @Column('uuid', { nullable: true }) @Index() organizationId?: string | null;
  @Column({ type: 'varchar', length: 16, default: 'medium' }) severity!: string;
  @Column({ type: 'varchar', length: 24, default: 'open' }) status!: string;
  @Column({ type: 'text' }) title!: string;
  @Column({ type: 'text' }) details!: string;
  @Column({ type: 'varchar', length: 24, default: 'control' }) kind!: string;
  @Column({ type: 'text', nullable: true }) @Index() correlationId?: string | null;
  @Column({ type: 'varchar', length: 12, nullable: true }) requestMethod?: string | null;
  @Column({ type: 'text', nullable: true }) requestPath?: string | null;
  @Column({ type: 'int', nullable: true }) originalStatus?: number | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) errorCode?: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) errorName?: string | null;
  @Column({ type: 'text', nullable: true }) stackTrace?: string | null;
  @Column('uuid', { nullable: true }) @Index() actorId?: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata!: Record<string, unknown>;
  @Column({ type: 'text', nullable: true }) resolutionComment?: string | null;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) evidence!: Array<{ fileName: string; url?: string }>;
  @Column('uuid', { nullable: true }) resolvedById?: string | null;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt?: Date | null;
}

@Entity('system_incidents')
@Index(['status', 'startedAt'])
export class SystemIncidentEntity extends AuditedEntity {
  @Column({ type: 'text' }) title!: string;
  @Column({ type: 'text' }) component!: string;
  @Column({ type: 'varchar', length: 16 }) severity!: string;
  @Column({ type: 'varchar', length: 24, default: 'investigating' }) status!: string;
  @Column({ type: 'text', nullable: true }) description?: string | null;
  @Column({ type: 'timestamptz' }) startedAt!: Date;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt?: Date | null;
}

@Entity('system_components')
@Index(['key'], { unique: true })
export class SystemComponentEntity extends AuditedEntity {
  @Column({ type: 'text' }) key!: string;
  @Column({ type: 'text' }) name!: string;
  @Column({ type: 'varchar', length: 24, default: 'healthy' }) status!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata!: Record<string, unknown>;
  @Column({ type: 'timestamptz', nullable: true }) checkedAt?: Date | null;
}

@Entity('application_options')
@Index(['namespace', 'key', 'organizationId'])
@Index(['namespace', 'isActive', 'sortOrder'])
export class ApplicationOptionEntity extends AuditedEntity {
  @Column({ type: 'text' }) namespace!: string;
  @Column({ type: 'text' }) key!: string;
  @Column({ type: 'text' }) label!: string;
  @Column({ type: 'jsonb' }) value!: unknown;
  @Column({ type: 'varchar', length: 16, default: 'string' }) valueType!: string;
  @Column('uuid', { nullable: true }) @Index() organizationId?: string | null;
  @Column({ type: 'text', nullable: true }) description?: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) validation!: Record<string, unknown>;
  @Column({ type: 'boolean', default: false }) isPublic!: boolean;
  @Column({ type: 'boolean', default: true }) isActive!: boolean;
  @Column({ type: 'int', default: 0 }) sortOrder!: number;
}

@Entity('application_option_history')
@Index(['optionId', 'createdAt'])
export class ApplicationOptionHistoryEntity extends AuditedEntity {
  @Column('uuid') @Index() optionId!: string;
  @Column({ type: 'varchar', length: 16 }) action!: string;
  @Column({ type: 'jsonb' }) snapshot!: Record<string, unknown>;
  @Column({ type: 'text', nullable: true }) reason?: string | null;
}
