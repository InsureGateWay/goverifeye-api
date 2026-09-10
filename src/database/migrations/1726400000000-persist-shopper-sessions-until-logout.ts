import { MigrationInterface, QueryRunner } from 'typeorm';

export class PersistShopperSessionsUntilLogout1726400000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "shopper_sessions"
      SET "expiresAt" = '9999-12-31 23:59:59.999',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "expiresAt" > CURRENT_TIMESTAMP
    `);
  }

  async down(): Promise<void> {
    // Existing expiry timestamps cannot be reconstructed after the data update.
  }
}
