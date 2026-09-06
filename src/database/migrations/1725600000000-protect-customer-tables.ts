import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProtectCustomerTables1725600000000 implements MigrationInterface {
  private readonly tables = ['shoppers', 'shopper_challenges', 'shopper_sessions', 'customer_checks', 'customer_concerns'];

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    // Shopper access is enforced by the backend, never by direct Data API access.
    // The database owner used by TypeORM retains access with RLS enabled.
    for (const table of this.tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    for (const table of this.tables) {
      await queryRunner.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
    }
  }
}
