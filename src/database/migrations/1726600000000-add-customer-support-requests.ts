import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddCustomerSupportRequests1726600000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.createTable(new Table({
      name: 'customer_support_requests',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', isGenerated: true },
        { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        { name: 'version', type: 'integer', default: 1 },
        { name: 'requestId', type: 'uuid', isUnique: true },
        { name: 'shopperId', type: 'uuid', isNullable: true },
        { name: 'email', type: 'varchar', length: '254' },
        { name: 'subject', type: 'varchar', length: '120' },
        { name: 'message', type: 'text' },
        { name: 'attachmentName', type: 'varchar', length: '120', isNullable: true },
        { name: 'attachmentMimeType', type: 'varchar', length: '32', isNullable: true },
        { name: 'attachmentSha256', type: 'varchar', length: '64', isNullable: true },
      ],
    }));
    await q.createIndex('customer_support_requests', new TableIndex({ name: 'IDX_customer_support_requests_shopper', columnNames: ['shopperId'] }));
  }

  async down(q: QueryRunner) { await q.dropTable('customer_support_requests'); }
}
