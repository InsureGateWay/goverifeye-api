import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v3.3.7 requires a vendor assignment before dispatch and forbids assigning a
 * vendor inside activation. Keep historical claim tables for audit, but restore
 * strict immutability for every code batch created from this release onward.
 */
export class RetireOpenMarketClaiming1726200000000 implements MigrationInterface {
  name = 'RetireOpenMarketClaiming1726200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE OR REPLACE FUNCTION protect_code_batch_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Code batches cannot be deleted or reissued'; END IF;
      IF TG_OP='INSERT' THEN
        IF substring(NEW.id::text,15,1)<>'7' THEN RAISE EXCEPTION 'New code batches require UUIDv7'; END IF;
      ELSIF OLD.id IS DISTINCT FROM NEW.id OR OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR OLD."allocationVendorId" IS DISTINCT FROM NEW."allocationVendorId" OR (OLD.namespace IS NOT NULL AND OLD.namespace IS DISTINCT FROM NEW.namespace) THEN
        RAISE EXCEPTION 'Code batch identity and vendor assignment are immutable';
      END IF;
      RETURN NEW;
    END $$`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`CREATE OR REPLACE FUNCTION protect_code_batch_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Code batches cannot be deleted or reissued'; END IF;
      IF TG_OP='INSERT' THEN
        IF substring(NEW.id::text,15,1)<>'7' THEN RAISE EXCEPTION 'New code batches require UUIDv7'; END IF;
      ELSIF OLD.id IS DISTINCT FROM NEW.id OR (OLD.namespace IS NOT NULL AND OLD.namespace IS DISTINCT FROM NEW.namespace) THEN
        RAISE EXCEPTION 'Code batch identity and vendor assignment are immutable';
      ELSIF OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR OLD."allocationVendorId" IS DISTINCT FROM NEW."allocationVendorId" THEN
        IF NOT (
          COALESCE(OLD."clientRequestId", '') LIKE 'open-market:%'
          AND OLD.status='allocated'
          AND NEW.status='market_active'
          AND OLD."organizationId"=OLD."allocationVendorId"
          AND NEW."organizationId"=NEW."allocationVendorId"
          AND OLD."organizationId" IS DISTINCT FROM NEW."organizationId"
        ) THEN RAISE EXCEPTION 'Code batch identity and vendor assignment are immutable'; END IF;
      END IF;
      RETURN NEW;
    END $$`);
  }
}
