import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeVerificationCodeLengthConfigurable1724700000000 implements MigrationInterface {
  async up(query: QueryRunner) {
    await query.query('ALTER TABLE "verification_codes" ALTER COLUMN "code" TYPE varchar(32)');
  }

  async down(query: QueryRunner) {
    await query.query('ALTER TABLE "verification_codes" ALTER COLUMN "code" TYPE varchar(16)');
  }
}
