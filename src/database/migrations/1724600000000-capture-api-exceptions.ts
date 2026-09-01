import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class CaptureApiExceptions1724600000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.changeColumn('audit_exceptions', 'createdById', new TableColumn({ name: 'createdById', type: 'uuid', isNullable: true }));
    await q.changeColumn('audit_exceptions', 'updatedById', new TableColumn({ name: 'updatedById', type: 'uuid', isNullable: true }));
    await q.addColumns('audit_exceptions', [
      new TableColumn({ name: 'kind', type: 'varchar', length: '24', default: "'control'" }),
      new TableColumn({ name: 'correlationId', type: 'text', isNullable: true }),
      new TableColumn({ name: 'requestMethod', type: 'varchar', length: '12', isNullable: true }),
      new TableColumn({ name: 'requestPath', type: 'text', isNullable: true }),
      new TableColumn({ name: 'originalStatus', type: 'int', isNullable: true }),
      new TableColumn({ name: 'errorCode', type: 'varchar', length: '100', isNullable: true }),
      new TableColumn({ name: 'errorName', type: 'varchar', length: '200', isNullable: true }),
      new TableColumn({ name: 'stackTrace', type: 'text', isNullable: true }),
      new TableColumn({ name: 'actorId', type: 'uuid', isNullable: true }),
      new TableColumn({ name: 'metadata', type: 'jsonb', default: "'{}'::jsonb" }),
    ]);
    await q.createIndex('audit_exceptions', new TableIndex({ name: 'IDX_audit_exception_kind_status_created', columnNames: ['kind', 'status', 'createdAt'] }));
    await q.createIndex('audit_exceptions', new TableIndex({ name: 'IDX_audit_exception_correlation', columnNames: ['correlationId'] }));
    await q.createIndex('audit_exceptions', new TableIndex({ name: 'IDX_audit_exception_actor', columnNames: ['actorId'] }));
  }

  async down(q: QueryRunner) {
    for (const name of ['IDX_audit_exception_actor', 'IDX_audit_exception_correlation', 'IDX_audit_exception_kind_status_created']) {
      await q.dropIndex('audit_exceptions', name);
    }
    for (const name of ['metadata', 'actorId', 'stackTrace', 'errorName', 'errorCode', 'originalStatus', 'requestPath', 'requestMethod', 'correlationId', 'kind']) {
      await q.dropColumn('audit_exceptions', name);
    }
    await q.query(`DELETE FROM "audit_exceptions" WHERE "createdById" IS NULL OR "updatedById" IS NULL`);
    await q.changeColumn('audit_exceptions', 'updatedById', new TableColumn({ name: 'updatedById', type: 'uuid' }));
    await q.changeColumn('audit_exceptions', 'createdById', new TableColumn({ name: 'createdById', type: 'uuid' }));
  }
}
