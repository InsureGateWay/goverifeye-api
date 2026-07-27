import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBatchLogisticsService1723700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.addColumn('code_batches', new TableColumn({
      name: 'logisticsService',
      type: 'varchar',
      isNullable: true,
    }));
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.dropColumn('code_batches', 'logisticsService');
  }
}
