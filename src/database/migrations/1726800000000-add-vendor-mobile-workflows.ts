import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVendorMobileWorkflows1726800000000 implements MigrationInterface {
  name = 'AddVendorMobileWorkflows1726800000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "customer_concerns" ADD COLUMN IF NOT EXISTS "status" varchar(24) NOT NULL DEFAULT 'new'`);
    await q.query(`ALTER TABLE "customer_concerns" ADD COLUMN IF NOT EXISTS "assignedToId" uuid`);
    await q.query(`ALTER TABLE "customer_concerns" ADD COLUMN IF NOT EXISTS "resolutionNote" text`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_customer_concerns_status" ON "customer_concerns" ("status")`);

    await q.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "informationRequest" text`);
    await q.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "infoRequiredFields" jsonb NOT NULL DEFAULT '[]'::jsonb`);

    await q.query(`CREATE TABLE IF NOT EXISTS "recall_actions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "version" integer NOT NULL DEFAULT 1,
      "organizationId" uuid NOT NULL,
      "actorId" uuid NOT NULL,
      "scopeType" varchar(16) NOT NULL,
      "scopeId" uuid NOT NULL,
      "previousStatus" varchar(32) NOT NULL,
      "reason" text NOT NULL,
      "affectedCodes" integer NOT NULL DEFAULT 0,
      CONSTRAINT "CHK_recall_scope_type" CHECK ("scopeType" IN ('product','batch')),
      CONSTRAINT "FK_recall_organization" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_recall_actor" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_recall_actions_org_created" ON "recall_actions" ("organizationId", "createdAt")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_recall_actions_scope" ON "recall_actions" ("scopeId")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "recall_actions"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_customer_concerns_status"`);
    await q.query(`ALTER TABLE "customer_concerns" DROP COLUMN IF EXISTS "resolutionNote"`);
    await q.query(`ALTER TABLE "customer_concerns" DROP COLUMN IF EXISTS "assignedToId"`);
    await q.query(`ALTER TABLE "customer_concerns" DROP COLUMN IF EXISTS "status"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "infoRequiredFields"`);
    await q.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "informationRequest"`);
  }
}
