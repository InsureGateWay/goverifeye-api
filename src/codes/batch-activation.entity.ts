import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

@Entity('product_batches')
@Index(['organizationId', 'productId', 'lotReference'], { unique: true })
export class ProductBatchEntity extends BaseEntity {
  @Column('uuid') organizationId!: string;
  @Column('uuid') productId!: string;
  @Column({ length: 100 }) lotReference!: string;
  @Column({ type: 'date', nullable: true }) manufacturingDate?: string | null;
  @Column({ type: 'date', nullable: true }) expiryDate?: string | null;
}

@Entity('batch_activation_limits')
export class BatchActivationLimitEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 }) key!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) failures!: number[];
  @Column({ type: 'timestamptz', nullable: true }) cooldownUntil!: Date | null;
}

@Entity('batch_activation_events')
@Index(['batchId', 'createdAt'])
export class BatchActivationEventEntity extends BaseEntity {
  @Column('uuid', { nullable: true }) batchId!: string | null;
  @Column('uuid') organizationId!: string;
  @Column('uuid') actorId!: string;
  @Column('uuid') sessionId!: string;
  @Column() action!: string;
  @Column() outcome!: string;
  @Column({ nullable: true }) reason?: string;
}
