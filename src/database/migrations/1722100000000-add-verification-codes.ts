import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex, TableUnique } from 'typeorm';
const timestamps = [
  { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' as const },
  { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  { name: 'version', type: 'int', default: 1 },
];
export class AddVerificationCodes1722100000000 implements MigrationInterface {
  async up(query: QueryRunner) {
    await query.addColumn('code_batches', new TableColumn({ name: 'generatedBy', type: 'uuid', isNullable: false }));
    await query.createTable(new Table({ name: 'verification_codes', columns: [
      ...timestamps, { name: 'organizationId', type: 'uuid' }, { name: 'productId', type: 'uuid' }, { name: 'batchId', type: 'uuid' },
      { name: 'code', type: 'varchar', length: '16' }, { name: 'activationCodeHash', type: 'varchar', length: '64' },
      { name: 'status', type: 'varchar', length: '20', default: "'inactive'" }, { name: 'activationAttempts', type: 'int', default: 0 },
      { name: 'verificationCount', type: 'int', default: 0 }, { name: 'activatedAt', type: 'timestamp', isNullable: true },
      { name: 'activatedBy', type: 'uuid', isNullable: true }, { name: 'lastVerifiedAt', type: 'timestamp', isNullable: true },
    ], uniques: [new TableUnique({ name: 'UQ_verification_codes_code', columnNames: ['code'] })] }));
    await query.createIndex('verification_codes', new TableIndex({ name: 'IDX_verification_codes_organization_product', columnNames: ['organizationId', 'productId'] }));
    await query.createIndex('verification_codes', new TableIndex({ name: 'IDX_verification_codes_batch', columnNames: ['batchId'] }));
    await query.createForeignKey('verification_codes', new TableForeignKey({ name: 'FK_verification_codes_batch', columnNames: ['batchId'], referencedTableName: 'code_batches', referencedColumnNames: ['id'], onDelete: 'CASCADE' }));
    await query.createForeignKey('verification_codes', new TableForeignKey({ name: 'FK_verification_codes_product', columnNames: ['productId'], referencedTableName: 'products', referencedColumnNames: ['id'], onDelete: 'RESTRICT' }));
    await query.createForeignKey('code_batches', new TableForeignKey({ name: 'FK_code_batches_product', columnNames: ['productId'], referencedTableName: 'products', referencedColumnNames: ['id'], onDelete: 'RESTRICT' }));
  }
  async down(query: QueryRunner) {
    await query.dropTable('verification_codes', true);
    const batch = await query.getTable('code_batches'); const key = batch?.foreignKeys.find(item => item.name === 'FK_code_batches_product');
    if (key) await query.dropForeignKey('code_batches', key);
    await query.dropColumn('code_batches', 'generatedBy');
  }
}
