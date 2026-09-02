import { Column, Entity, Index } from 'typeorm'; import { BaseEntity } from '../database/base.entity'; import { ProductStatus } from './product.model';
import { SubmittedByIdentity } from '../common/request-context';
@Entity('products') @Index(['organizationId', 'name'])
export class ProductEntity extends BaseEntity {
  @Column('uuid') @Index() organizationId!: string;
  @Column({ length: 150 }) name!: string; @Column('text') description!: string;
  @Column({ length: 100 }) form!: string; @Column({ length: 150 }) manufacturer!: string;
  @Column({ type: 'varchar', nullable: true }) imageUrl?: string | null; @Column({ type: 'varchar', nullable: true }) verificationDocumentUrl?: string | null;
  @Column({ type: 'varchar', length: 20, default: ProductStatus.Pending }) status!: ProductStatus;
  @Column({type:'varchar',length:20,nullable:true}) statusBeforeArchive?:ProductStatus|null;
  @Column('text', { nullable: true }) rejectionReason?: string; @Column({ default: 0 }) totalCodes!: number;
  @Column({ default: 0 }) scanned!: number; @Column({ default: 0 }) suspicious!: number; @Column('uuid') createdBy!: string;
  @Column({ type: 'jsonb', nullable: true }) submittedBy?: SubmittedByIdentity | null;
  @Column({ type: 'jsonb', nullable: true }) approvedBy?: SubmittedByIdentity | null;
}
