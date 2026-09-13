import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AllowPreAuthAuditEvents1726500000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.changeColumn('audit_logs', 'organizationId', new TableColumn({
      name: 'organizationId',
      type: 'uuid',
      isNullable: true,
    }));
    await q.changeColumn('audit_logs', 'actorId', new TableColumn({
      name: 'actorId',
      type: 'uuid',
      isNullable: true,
    }));
  }

  async down(q: QueryRunner) {
    await q.query(`DELETE FROM "audit_logs" WHERE "organizationId" IS NULL OR "actorId" IS NULL`);
    await q.changeColumn('audit_logs', 'actorId', new TableColumn({
      name: 'actorId',
      type: 'uuid',
    }));
    await q.changeColumn('audit_logs', 'organizationId', new TableColumn({
      name: 'organizationId',
      type: 'uuid',
    }));
  }
}
