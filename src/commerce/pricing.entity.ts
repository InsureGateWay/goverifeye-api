import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { LabelType } from '../codes/code.enums';

@Entity('code_pricing')
export class CodePricingEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16 })
  labelType!: LabelType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPriceNgn!: string;

  @Column({ type: 'uuid', nullable: true })
  updatedBy?: string | null;
}
