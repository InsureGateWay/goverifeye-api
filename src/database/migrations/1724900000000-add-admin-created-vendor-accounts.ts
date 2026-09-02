import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAdminCreatedVendorAccounts1724900000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.addColumn('users', new TableColumn({ name: 'mustChangePassword', type: 'boolean', default: false }));
    await q.addColumn('vendor_invitations', new TableColumn({ name: 'organizationId', type: 'uuid', isNullable: true }));
    await q.addColumn('vendor_invitations', new TableColumn({ name: 'userId', type: 'uuid', isNullable: true }));
    await q.addColumn('vendor_invitations', new TableColumn({ name: 'documents', type: 'jsonb', default: "'[]'::jsonb" }));
    await q.query('CREATE INDEX "IDX_vendor_invitations_organization" ON "vendor_invitations" ("organizationId")');
    await q.query('CREATE INDEX "IDX_vendor_invitations_user" ON "vendor_invitations" ("userId")');
  }
  async down(q: QueryRunner) {
    await q.query('DROP INDEX "IDX_vendor_invitations_user"');
    await q.query('DROP INDEX "IDX_vendor_invitations_organization"');
    await q.dropColumn('vendor_invitations', 'documents');
    await q.dropColumn('vendor_invitations', 'userId');
    await q.dropColumn('vendor_invitations', 'organizationId');
    await q.dropColumn('users', 'mustChangePassword');
  }
}
