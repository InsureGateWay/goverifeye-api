import { MigrationInterface, QueryRunner, Table, TableColumnOptions, TableIndex, TableForeignKey } from 'typeorm';

export class AddCustomerIntegration1725500000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    const common: TableColumnOptions[] = [
      { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' },
      { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
      { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
      { name: 'version', type: 'int', default: 1 },
    ];
    const tables: Array<[string, TableColumnOptions[]]> = [
      ['shoppers', [{ name: 'email', type: 'varchar', length: '254', isUnique: true }]],
      ['shopper_challenges', [{ name: 'email', type: 'varchar', length: '254' }, { name: 'codeHash', type: 'varchar' }, { name: 'expiresAt', type: 'timestamp' }, { name: 'attempts', type: 'int', default: 0 }, { name: 'consumed', type: 'boolean', default: false }]],
      ['shopper_sessions', [{ name: 'shopperId', type: 'uuid' }, { name: 'tokenHash', type: 'varchar', isUnique: true }, { name: 'expiresAt', type: 'timestamp' }]],
      ['customer_checks', [{ name: 'shopperId', type: 'uuid', isNullable: true }, { name: 'requestId', type: 'uuid', isUnique: true }, { name: 'receipt', type: 'varchar', length: '64', isUnique: true }, { name: 'code', type: 'varchar', length: '16' }, { name: 'channel', type: 'varchar', length: '10' }, { name: 'result', type: 'json' }]],
      ['customer_concerns', [{ name: 'requestId', type: 'uuid', isUnique: true }, { name: 'checkId', type: 'uuid' }, { name: 'reason', type: 'varchar', length: '100' }, { name: 'note', type: 'text', isNullable: true }, { name: 'photo', type: 'text', isNullable: true }]],
    ];
    for (const [name, columns] of tables) await q.createTable(new Table({ name, columns: [...common, ...columns] }));
    await q.createIndex('shopper_challenges', new TableIndex({ name: 'IDX_shopper_challenge_email', columnNames: ['email'] }));
    await q.createIndex('shopper_sessions', new TableIndex({ name: 'IDX_shopper_session_owner', columnNames: ['shopperId'] }));
    await q.createIndex('customer_checks', new TableIndex({ name: 'IDX_customer_check_history', columnNames: ['shopperId', 'createdAt'] }));
    await q.createForeignKey('shopper_sessions', new TableForeignKey({ columnNames: ['shopperId'], referencedTableName: 'shoppers', referencedColumnNames: ['id'], onDelete: 'CASCADE' }));
    await q.createForeignKey('customer_checks', new TableForeignKey({ columnNames: ['shopperId'], referencedTableName: 'shoppers', referencedColumnNames: ['id'], onDelete: 'SET NULL' }));
    await q.createForeignKey('customer_concerns', new TableForeignKey({ columnNames: ['checkId'], referencedTableName: 'customer_checks', referencedColumnNames: ['id'], onDelete: 'CASCADE' }));
  }
  async down(q: QueryRunner) { for (const table of ['customer_concerns', 'customer_checks', 'shopper_sessions', 'shopper_challenges', 'shoppers']) await q.dropTable(table); }
}
