import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSubmittedByIdentity1725200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('products', new TableColumn({ name:'submittedBy', type:'jsonb', isNullable:true }));
    await queryRunner.addColumn('products', new TableColumn({ name:'approvedBy', type:'jsonb', isNullable:true }));
    await queryRunner.addColumn('organizations', new TableColumn({ name:'submittedBy', type:'jsonb', isNullable:true }));
    await queryRunner.addColumn('organizations', new TableColumn({ name:'approvedBy', type:'jsonb', isNullable:true }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('organizations', 'approvedBy');
    await queryRunner.dropColumn('organizations', 'submittedBy');
    await queryRunner.dropColumn('products', 'approvedBy');
    await queryRunner.dropColumn('products', 'submittedBy');
  }
}
