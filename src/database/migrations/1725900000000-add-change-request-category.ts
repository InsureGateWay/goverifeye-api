import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddChangeRequestCategory1725900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('organization_change_requests', new TableColumn({
      name: 'category',
      type: 'varchar',
      length: '100',
      default: "'Other'",
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('organization_change_requests', 'category');
  }
}
