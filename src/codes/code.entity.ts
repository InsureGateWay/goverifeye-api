import { Column, Entity, Index, Unique } from 'typeorm'; import { BaseEntity } from '../database/base.entity'; import { BatchStatus, Fulfillment, LabelType, VerificationCodeStatus } from './code.enums';
export { BatchStatus, VerificationCodeStatus } from './code.enums';
@Entity('code_batches') @Index(['organizationId','clientRequestId'],{unique:true}) export class CodeBatchEntity extends BaseEntity { @Column('uuid') @Index() organizationId!: string; @Column({nullable:true}) clientRequestId?:string; @Column('uuid') @Index() productId!: string; @Column() labelType!: LabelType; @Column() fulfillment!: Fulfillment; @Column() quantity!: number; @Column({ nullable: true }) paperSize?: string; @Column({ nullable: true }) logisticsService?: string; @Column({ default: BatchStatus.Generating }) status!: BatchStatus; @Column({ default: 0 }) scanned!: number; @Column('uuid') generatedBy!: string; }
@Entity('verification_codes') @Unique('UQ_verification_codes_code', ['code']) @Index(['organizationId', 'productId'])
export class VerificationCodeEntity extends BaseEntity {
  @Column('uuid') @Index() organizationId!: string; @Column('uuid') @Index() productId!: string; @Column('uuid') @Index() batchId!: string;
  @Column({ type: 'varchar', length: 16 }) code!: string; @Column({ type: 'varchar', length: 64 }) activationCodeHash!: string;
  @Column({ type: 'varchar', length: 20, default: VerificationCodeStatus.Inactive }) status!: VerificationCodeStatus;
  @Column({ default: 0 }) activationAttempts!: number; @Column({ default: 0 }) verificationCount!: number; @Column({ type: 'timestamp', nullable: true }) activatedAt?: Date;
  @Column('uuid', { nullable: true }) activatedBy?: string; @Column({ type: 'timestamp', nullable: true }) lastVerifiedAt?: Date;
}
@Entity('verification_events') @Index(['organizationId','createdAt']) export class VerificationEventEntity extends BaseEntity { @Column('uuid') organizationId!:string; @Column('uuid') productId!:string; @Column('uuid') codeId!:string; @Column({default:'valid'}) outcome!:string; @Column({nullable:true}) location?:string; @Column({nullable:true}) ipHash?:string; @Column({nullable:true}) userAgentHash?:string; @Column({default:0}) riskScore!:number; @Column({type:'json',nullable:true}) riskReasons?:string[]; }
