import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntroduceScopedUserRoles1725300000000 implements MigrationInterface {
  async up(q:QueryRunner):Promise<void>{
    await q.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'vendor_admin'`);
    await q.query(`UPDATE users u SET role=CASE WHEN role='admin' THEN CASE WHEN u."organizationId" IN (SELECT "organizationId" FROM users WHERE role='super_admin') THEN 'platform_admin' ELSE 'vendor_admin' END WHEN role='staff' THEN CASE WHEN u."organizationId" IN (SELECT "organizationId" FROM users WHERE role='super_admin') THEN 'platform_staff' ELSE 'vendor_staff' END ELSE role END`);
    await q.query(`UPDATE team_members t SET role=CASE WHEN t."userId" IN (SELECT id FROM users WHERE role='super_admin') THEN 'super_admin' WHEN role='admin' THEN CASE WHEN t."organizationId" IN (SELECT "organizationId" FROM users WHERE role='super_admin') THEN 'platform_admin' ELSE 'vendor_admin' END WHEN role='staff' THEN CASE WHEN t."organizationId" IN (SELECT "organizationId" FROM users WHERE role='super_admin') THEN 'platform_staff' ELSE 'vendor_staff' END ELSE role END`);
    await q.query(`UPDATE team_invitations t SET role=CASE WHEN role='admin' THEN CASE WHEN t."organizationId" IN (SELECT "organizationId" FROM users WHERE role='super_admin') THEN 'platform_admin' ELSE 'vendor_admin' END WHEN role='staff' THEN CASE WHEN t."organizationId" IN (SELECT "organizationId" FROM users WHERE role='super_admin') THEN 'platform_staff' ELSE 'vendor_staff' END ELSE role END`);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'admin'`);
    await q.query(`UPDATE users SET role=CASE WHEN role IN ('vendor_admin','platform_admin') THEN 'admin' WHEN role IN ('vendor_staff','platform_staff') THEN 'staff' ELSE role END`);
    await q.query(`UPDATE team_members SET role=CASE WHEN role IN ('vendor_admin','platform_admin') THEN 'admin' WHEN role IN ('vendor_staff','platform_staff') THEN 'staff' ELSE role END`);
    await q.query(`UPDATE team_invitations SET role=CASE WHEN role IN ('vendor_admin','platform_admin') THEN 'admin' WHEN role IN ('vendor_staff','platform_staff') THEN 'staff' ELSE role END`);
  }
}
