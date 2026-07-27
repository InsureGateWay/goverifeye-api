import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class FixOpenMarketVersionColumns1724000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    for (const table of ['open_market_batches', 'open_market_claims']) {
      if (await queryRunner.hasTable(table) && !await queryRunner.hasColumn(table, 'version')) {
        await queryRunner.addColumn(table, new TableColumn({
          name: 'version',
          type: 'int',
          default: 1,
        }))
      }
    }
  }

  async down(queryRunner: QueryRunner) {
    for (const table of ['open_market_claims', 'open_market_batches']) {
      if (await queryRunner.hasTable(table) && await queryRunner.hasColumn(table, 'version')) {
        await queryRunner.dropColumn(table, 'version')
      }
    }
  }
}
