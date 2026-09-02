import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class MakeVerificationCodeLengthConfigurable1724700000000 implements MigrationInterface {
  async up(query: QueryRunner) {
    await query.changeColumn('verification_codes', 'code', new TableColumn({ name: 'code', type: 'varchar', length: '32', isNullable: false }));
  }

  async down(query: QueryRunner) {
    await query.changeColumn('verification_codes', 'code', new TableColumn({ name: 'code', type: 'varchar', length: '16', isNullable: false }));
  }
}
