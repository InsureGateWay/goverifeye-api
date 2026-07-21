import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
const timestamps = [
  { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' as const },
  { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  { name: 'version', type: 'int', default: 1 },
];
export class InitialSchema1722000000000 implements MigrationInterface {
  async up(query: QueryRunner) {
    await query.createTable(new Table({ name: 'organizations', columns: [...timestamps, { name: 'companyName', type: 'varchar', isUnique: true }, { name: 'registrationNumber', type: 'varchar', isUnique: true }, { name: 'industry', type: 'varchar' }, { name: 'country', type: 'varchar' }, { name: 'administrator', type: 'json' }, { name: 'address', type: 'json' }, { name: 'documents', type: 'json' }, { name: 'status', type: 'varchar', default: "'submitted'" }] }));
    await query.createTable(new Table({ name: 'users', columns: [...timestamps, { name: 'email', type: 'varchar', isUnique: true }, { name: 'passwordHash', type: 'varchar' }, { name: 'organizationId', type: 'uuid' }, { name: 'role', type: 'varchar', default: "'admin'" }, { name: 'isActive', type: 'boolean', default: true }] }));
    await query.createTable(new Table({ name: 'otp_challenges', columns: [...timestamps, { name: 'email', type: 'varchar' }, { name: 'hash', type: 'varchar' }, { name: 'expiresAt', type: 'timestamp' }, { name: 'attempts', type: 'int', default: 0 }, { name: 'consumed', type: 'boolean', default: false }] }));
    await query.createTable(new Table({ name: 'products', columns: [...timestamps, { name: 'organizationId', type: 'uuid' }, { name: 'name', type: 'varchar' }, { name: 'description', type: 'text' }, { name: 'form', type: 'varchar' }, { name: 'manufacturer', type: 'varchar' }, { name: 'imageUrl', type: 'varchar', isNullable: true }, { name: 'verificationDocumentUrl', type: 'varchar', isNullable: true }, { name: 'status', type: 'varchar', default: "'pending'" }, { name: 'rejectionReason', type: 'text', isNullable: true }, { name: 'totalCodes', type: 'int', default: 0 }, { name: 'scanned', type: 'int', default: 0 }, { name: 'suspicious', type: 'int', default: 0 }, { name: 'createdBy', type: 'uuid' }] }));
    await query.createTable(new Table({ name: 'code_batches', columns: [...timestamps, { name: 'organizationId', type: 'uuid' }, { name: 'productId', type: 'uuid' }, { name: 'labelType', type: 'varchar' }, { name: 'fulfillment', type: 'varchar' }, { name: 'quantity', type: 'int' }, { name: 'paperSize', type: 'varchar', isNullable: true }, { name: 'status', type: 'varchar', default: "'generated'" }, { name: 'scanned', type: 'int', default: 0 }, { name: 'activatedAt', type: 'timestamp', isNullable: true }] }));
    await query.createTable(new Table({ name: 'team_members', columns: [...timestamps, { name: 'organizationId', type: 'uuid' }, { name: 'firstName', type: 'varchar' }, { name: 'lastName', type: 'varchar' }, { name: 'email', type: 'varchar' }, { name: 'role', type: 'varchar' }, { name: 'status', type: 'varchar', default: "'pending'" }] }));
    for (const table of ['users', 'products', 'code_batches', 'team_members']) await query.createIndex(table, new TableIndex({ name: `IDX_${table}_organization`, columnNames: ['organizationId'] }));
  }
  async down(query: QueryRunner) { for (const table of ['team_members', 'code_batches', 'products', 'otp_challenges', 'users', 'organizations']) await query.dropTable(table, true); }
}
