import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import type { VerificationChannel, VerifyCodeResponseDto } from './customer.contract';

@Entity('shoppers')
export class ShopperEntity extends BaseEntity {
  @Column({ unique: true, length: 254 }) email!: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) displayName!: string | null;
  @Column({ type: 'varchar', nullable: true, select: false }) passwordHash!: string | null;
}
@Entity('shopper_challenges')
export class ShopperChallengeEntity extends BaseEntity {
  @Column({ length: 254 }) @Index() email!: string;
  @Column({ length: 24, default: 'login' }) purpose!: 'login' | 'registration' | 'password_reset';
  @Column() codeHash!: string;
  @Column('timestamp') expiresAt!: Date;
  @Column({ default: 0 }) attempts!: number;
  @Column({ default: false }) consumed!: boolean;
  @Column({ type: 'varchar', nullable: true, unique: true }) actionTokenHash!: string | null;
  @Column('timestamp', { nullable: true }) actionExpiresAt!: Date | null;
  @Column('timestamp', { nullable: true }) actionCompletedAt!: Date | null;
}
@Entity('shopper_sessions')
export class ShopperSessionEntity extends BaseEntity {
  @Column('uuid') @Index() shopperId!: string;
  @Column({ unique: true }) tokenHash!: string;
  @Column('timestamp') expiresAt!: Date;
}
@Entity('customer_support_requests')
export class CustomerSupportRequestEntity extends BaseEntity {
  @Column('uuid', { unique: true }) requestId!: string;
  @Column('uuid', { nullable: true }) @Index() shopperId!: string | null;
  @Column({ length: 254 }) email!: string;
  @Column({ length: 120 }) subject!: string;
  @Column('text') message!: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) attachmentName!: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) attachmentMimeType!: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) attachmentSha256!: string | null;
}
@Entity('customer_checks')
@Index(['shopperId', 'createdAt'])
export class CustomerCheckEntity extends BaseEntity {
  @Column('uuid', { nullable: true }) shopperId!: string | null;
  @Column('uuid', { unique: true }) requestId!: string;
  @Column({ unique: true, length: 64 }) receipt!: string;
  @Column({ length: 16 }) code!: string;
  @Column({ length: 10 }) channel!: VerificationChannel;
  @Column('json') result!: VerifyCodeResponseDto;
}
@Entity('customer_concerns')
export class CustomerConcernEntity extends BaseEntity {
  @Column('uuid', { unique: true }) requestId!: string;
  @Column('uuid') checkId!: string;
  @Column({ length: 100 }) reason!: string;
  @Column('text', { nullable: true }) note!: string | null;
  @Column('text', { nullable: true, select: false }) photo!: string | null;
  @Column({ type: 'varchar', length: 24, default: 'new' }) @Index() status!: 'new' | 'reviewing' | 'resolved' | 'dismissed';
  @Column('uuid', { nullable: true }) assignedToId!: string | null;
  @Column('text', { nullable: true }) resolutionNote!: string | null;
}
