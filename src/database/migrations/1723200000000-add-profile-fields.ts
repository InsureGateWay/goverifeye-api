import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProfileFields1723200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.addColumn('users', new TableColumn({
      name: 'jobTitle',
      type: 'varchar',
      isNullable: true,
    }));
    await queryRunner.addColumn('organizations', new TableColumn({
      name: 'website',
      type: 'varchar',
      isNullable: true,
    }));
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.dropColumn('organizations', 'website');
    await queryRunner.dropColumn('users', 'jobTitle');
  }
}
