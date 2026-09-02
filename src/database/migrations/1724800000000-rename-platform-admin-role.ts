import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenamePlatformAdminRole1724800000000 implements MigrationInterface {
  async up(query: QueryRunner) {
    await query.query(`UPDATE "users" SET "role" = 'super_admin' WHERE "role" = 'platform_admin'`);
  }

  async down(query: QueryRunner) {
    await query.query(`UPDATE "users" SET "role" = 'platform_admin' WHERE "role" = 'super_admin'`);
  }
}
