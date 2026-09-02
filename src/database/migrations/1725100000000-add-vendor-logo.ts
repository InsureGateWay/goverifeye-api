import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddVendorLogo1725100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    if (!(await queryRunner.hasColumn('organizations', 'logoUrl'))) {
      await queryRunner.addColumn('organizations', new TableColumn({ name: 'logoUrl', type: 'varchar', isNullable: true }));
    }
  }

  async down(queryRunner: QueryRunner) {
    if (await queryRunner.hasColumn('organizations', 'logoUrl')) await queryRunner.dropColumn('organizations', 'logoUrl');
  }
}
