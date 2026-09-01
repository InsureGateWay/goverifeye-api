import { Column, Entity, Index } from 'typeorm';
import { AuditedEntity } from '../database/audited.entity';

@Entity('email_templates')
@Index(['key', 'status', 'versionNumber'])
@Index(['audience', 'status', 'updatedAt'])
export class EmailTemplateEntity extends AuditedEntity {
  @Column({ type: 'text' }) key!: string;
  @Column({ type: 'text' }) name!: string;
  @Column({ type: 'varchar', length: 24 }) audience!: string;
  @Column({ type: 'varchar', length: 24, default: 'draft' }) status!: string;
  @Column({ type: 'int' }) versionNumber!: number;
  @Column({ type: 'text' }) subjectTemplate!: string;
  @Column({ type: 'text' }) textTemplate!: string;
  @Column({ type: 'text' }) htmlTemplate!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) requiredVariables!: string[];
  @Column({ type: 'text', nullable: true }) description?: string | null;
  @Column({ type: 'boolean', default: true }) isSystem!: boolean;
  @Column({ type: 'timestamptz', nullable: true }) activatedAt?: Date | null;
  @Column('uuid', { nullable: true }) activatedById?: string | null;
}

@Entity('email_template_history')
@Index(['templateId', 'createdAt'])
@Index(['key', 'createdAt'])
export class EmailTemplateHistoryEntity extends AuditedEntity {
  @Column('uuid') @Index() templateId!: string;
  @Column({ type: 'text' }) key!: string;
  @Column({ type: 'varchar', length: 24 }) action!: string;
  @Column({ type: 'jsonb' }) snapshot!: Record<string, unknown>;
  @Column({ type: 'text' }) reason!: string;
}
