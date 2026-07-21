import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @CreateDateColumn({ type: 'timestamp' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamp' }) updatedAt!: Date;
  @VersionColumn() version!: number;
}
