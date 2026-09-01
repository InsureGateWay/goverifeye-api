import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

/** Base for mutable business records that require an attributable audit trail. */
export abstract class AuditedEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column('uuid')
  @Index()
  createdById!: string;

  @Column('uuid')
  @Index()
  updatedById!: string;

  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
  @DeleteDateColumn({ type: 'timestamptz', nullable: true }) deletedAt?: Date | null;
  @VersionColumn() version!: number;
}
