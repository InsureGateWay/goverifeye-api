import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import type { VerificationChannel, VerifyCodeResponseDto } from './customer.contract';

@Entity('shoppers')
export class ShopperEntity extends BaseEntity { @Column({ unique: true, length: 254 }) email!: string; }
@Entity('shopper_challenges')
export class ShopperChallengeEntity extends BaseEntity {
  @Column({ length: 254 }) @Index() email!: string;
  @Column() codeHash!: string;
  @Column('timestamp') expiresAt!: Date;
  @Column({ default: 0 }) attempts!: number;
  @Column({ default: false }) consumed!: boolean;
}
@Entity('shopper_sessions')
export class ShopperSessionEntity extends BaseEntity {
  @Column('uuid') @Index() shopperId!: string;
  @Column({ unique: true }) tokenHash!: string;
  @Column('timestamp') expiresAt!: Date;
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
}
