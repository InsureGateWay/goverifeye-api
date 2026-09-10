import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillChangeRequestAudits1726300000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "audit_logs" (
        "organizationId",
        "actorId",
        "action",
        "resourceType",
        "resourceId",
        "status",
        "metadata",
        "createdAt",
        "updatedAt"
      )
      SELECT
        request."organizationId",
        request."createdById",
        'organization.change_request.submitted',
        'organization_change_request',
        request."id"::text,
        'success',
        json_build_object(
          'category', request."category",
          'reference', 'CR-' || upper(substr(request."id"::text, 1, 8)),
          'details', 'Submitted ' || request."category" || ' change request',
          'backfilled', true
        ),
        request."createdAt"::timestamp,
        request."createdAt"::timestamp
      FROM "organization_change_requests" request
      WHERE NOT EXISTS (
        SELECT 1
        FROM "audit_logs" audit
        WHERE audit."action" = 'organization.change_request.submitted'
          AND audit."resourceType" = 'organization_change_request'
          AND audit."resourceId" = request."id"::text
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "audit_logs"
      WHERE "action" = 'organization.change_request.submitted'
        AND "resourceType" = 'organization_change_request'
        AND ("metadata"->>'backfilled')::boolean = true
    `);
  }
}
