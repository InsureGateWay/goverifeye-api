import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

const base = [
  { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' as const },
  { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  { name: 'version', type: 'int', default: 1 },
];

export class AddCodePricing1724300000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.createTable(
      new Table({
        name: 'code_pricing',
        columns: [
          ...base,
          { name: 'labelType', type: 'varchar', length: '16' },
          { name: 'unitPriceNgn', type: 'decimal', precision: 10, scale: 2 },
          { name: 'updatedBy', type: 'uuid', isNullable: true },
        ],
      }),
    );
    await queryRunner.createIndex(
      'code_pricing',
      new TableIndex({ name: 'IDX_code_pricing_label_type', columnNames: ['labelType'], isUnique: true }),
    );
    await queryRunner.query(`
      INSERT INTO code_pricing ("labelType", "unitPriceNgn")
      VALUES
        ('micro', 7.50),
        ('main', 0.00),
        ('pair', 14.25)
    `);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.dropTable('code_pricing', true);
  }
}
