import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { newBatchReference } from '../../codes/batch-format';

const base = [
  { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' as const },
  { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
  { name: 'version', type: 'int', default: 1 },
];

export class CompleteBatchActivationSpec1725700000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    for (const column of [
      { name: 'batchReference', type: 'char', length: '13', isNullable: true },
      { name: 'allocationVendorId', type: 'uuid', isNullable: true },
      { name: 'namespace', type: 'char', length: '4', isNullable: true },
      { name: 'productBatchId', type: 'uuid', isNullable: true },
      { name: 'releasedAt', type: 'timestamp', isNullable: true },
      { name: 'releasedBy', type: 'uuid', isNullable: true },
      { name: 'activationPinDigest', type: 'char', length: '64', isNullable: true },
      { name: 'activationPepperVersion', type: 'varchar', length: '32', isNullable: true },
      { name: 'pinRevealedAt', type: 'timestamp', isNullable: true },
    ]) await q.addColumn('code_batches', new TableColumn(column));
    await q.createIndex('code_batches', new TableIndex({ name: 'UQ_batch_reference', columnNames: ['batchReference'], isUnique: true }));
    // Existing IDs are cryptographic inputs: never regenerate them during migration.
    for (;;) {
      const rows: { id: string }[] = await q.query('SELECT id FROM code_batches WHERE "batchReference" IS NULL LIMIT 1000');
      if (!rows.length) break;
      for (const row of rows) {
        let updated: unknown[] = [];
        while (!updated.length) updated = await q.query('UPDATE code_batches SET "batchReference"=$1 WHERE id=$2 AND NOT EXISTS (SELECT 1 FROM code_batches WHERE "batchReference"=$1) RETURNING id', [newBatchReference(), row.id]);
      }
    }
    await q.query('UPDATE code_batches SET "allocationVendorId"="organizationId", namespace=(SELECT MIN(c.namespace) FROM verification_codes c WHERE c."batchId"=code_batches.id)');
    await q.query('ALTER TABLE code_batches ALTER COLUMN "batchReference" SET NOT NULL, ALTER COLUMN "allocationVendorId" SET NOT NULL');
    await q.query(`ALTER TABLE code_batches ADD CONSTRAINT "CHK_batch_reference" CHECK ("batchReference" ~ '^CB-[0-9A-HJKMNP-TV-Z]{10}$'), ADD CONSTRAINT "CHK_batch_vendor_assignment" CHECK ("allocationVendorId"="organizationId"), ADD CONSTRAINT "CHK_batch_pin_release" CHECK ("activationPinDigest" IS NULL OR ("activationMode"='controlled_physical_print' AND "releasedAt" IS NOT NULL AND "releasedBy" IS NOT NULL AND "pinRevealedAt" IS NOT NULL AND "activationPepperVersion" IS NOT NULL AND status='released_for_activation'))`);
    await q.createTable(new Table({ name: 'product_batches', columns: [...base,
      { name: 'organizationId', type: 'uuid' }, { name: 'productId', type: 'uuid' }, { name: 'lotReference', type: 'varchar', length: '100' },
      { name: 'manufacturingDate', type: 'date', isNullable: true }, { name: 'expiryDate', type: 'date', isNullable: true },
    ] }));
    await q.createIndex('product_batches', new TableIndex({ name: 'UQ_product_batch_lot', columnNames: ['organizationId', 'productId', 'lotReference'], isUnique: true }));
    // Historical allocations retain their old binding under an explicitly legacy lot reference.
    await q.query(`INSERT INTO product_batches (id,"organizationId","productId","lotReference","manufacturingDate","expiryDate") SELECT b.id,b."organizationId",b."productId",'legacy-'||b.id::text,b."manufacturingDate",b."expiryDate" FROM code_batches b WHERE EXISTS (SELECT 1 FROM verification_codes c WHERE c."batchId"=b.id AND c."codeFormatVersion" IS NOT NULL)`);
    await q.query('UPDATE code_batches SET "productBatchId"=id WHERE id IN (SELECT id FROM product_batches)');
    await q.createTable(new Table({ name: 'batch_activation_limits', columns: [
      { name: 'key', type: 'varchar', length: '64', isPrimary: true },
      { name: 'failures', type: 'jsonb', default: "'[]'::jsonb" },
      { name: 'cooldownUntil', type: 'timestamptz', isNullable: true },
    ] }));
    await q.createTable(new Table({ name: 'batch_activation_events', columns: [...base,
      { name: 'batchId', type: 'uuid', isNullable: true }, { name: 'organizationId', type: 'uuid' }, { name: 'actorId', type: 'uuid' },
      { name: 'sessionId', type: 'uuid' }, { name: 'action', type: 'varchar' }, { name: 'outcome', type: 'varchar' }, { name: 'reason', type: 'varchar', isNullable: true },
    ] }));
    await q.createIndex('batch_activation_events', new TableIndex({ name: 'IDX_batch_activation_events_batch_time', columnNames: ['batchId', 'createdAt'] }));
    for (const table of ['product_batches', 'batch_activation_limits', 'batch_activation_events']) await q.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await q.query(`CREATE FUNCTION protect_batch_activation_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Batch activation events are append-only'; END $$`);
    await q.query(`CREATE TRIGGER "TRG_batch_activation_event_immutable" BEFORE UPDATE OR DELETE ON batch_activation_events FOR EACH ROW EXECUTE FUNCTION protect_batch_activation_event()`);
    await q.query(`CREATE FUNCTION protect_code_batch_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Code batches cannot be deleted or reissued'; END IF;
      IF TG_OP='INSERT' THEN
        IF substring(NEW.id::text,15,1)<>'7' THEN RAISE EXCEPTION 'New code batches require UUIDv7'; END IF;
      ELSIF OLD.id IS DISTINCT FROM NEW.id OR OLD."organizationId" IS DISTINCT FROM NEW."organizationId" OR OLD."allocationVendorId" IS DISTINCT FROM NEW."allocationVendorId" OR (OLD.namespace IS NOT NULL AND OLD.namespace IS DISTINCT FROM NEW.namespace) THEN RAISE EXCEPTION 'Code batch identity and vendor assignment are immutable';
      END IF; RETURN NEW;
    END $$`);
    await q.query(`CREATE TRIGGER "TRG_code_batch_identity" BEFORE INSERT OR UPDATE OR DELETE ON code_batches FOR EACH ROW EXECUTE FUNCTION protect_code_batch_identity()`);
    await q.query(`DROP TRIGGER "TRG_bind_gve16_unit" ON verification_codes`);
    await q.query(`CREATE OR REPLACE FUNCTION bind_gve16_unit() RETURNS trigger AS $$ BEGIN IF NEW."codeFormatVersion" IS NOT NULL THEN NEW."unitId" := COALESCE(NEW."unitId", NEW.id); END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER "TRG_bind_gve16_unit" BEFORE INSERT ON verification_codes FOR EACH ROW EXECUTE FUNCTION bind_gve16_unit()`);
    await q.query(`ALTER TABLE verification_codes DROP CONSTRAINT "CHK_gve16_shape"`);
    await q.query(`ALTER TABLE verification_codes ADD CONSTRAINT "CHK_gve16_shape" CHECK ("codeFormatVersion" IS NULL OR ("codeFormatVersion" IN ('3.3.3','3.3.7') AND code ~ '^[0-9]{16}$' AND namespace IS NOT NULL AND namespace ~ '^[0-9]{4}$' AND "publicToken" IS NOT NULL AND "publicToken" ~ '^[0-9]{7}$' AND "luhnDigit" IS NOT NULL AND "luhnDigit" ~ '^[0-9]$' AND "antiFabTag" IS NOT NULL AND "antiFabTag" ~ '^[0-9]{4}$' AND "keyVersion" IS NOT NULL AND "allocationId" IS NOT NULL AND "unitId" IS NOT NULL AND "allocationId"="batchId" AND "unitId"=id AND "internalSerial" IS NOT NULL AND "internalSerial" BETWEEN 0 AND 9999999 AND (status<>'market_active' OR "productBatchId" IS NOT NULL) AND code=namespace||"publicToken"||"luhnDigit"||"antiFabTag"))`);
    // Old generation-time credentials are intentionally invalidated. Vendors reveal fresh PINs after release.
    await q.dropColumn('code_batches', 'activationCredentialHash');
    await q.dropColumn('code_batches', 'activationAttempts');
  }

  async down(): Promise<void> {
    throw new Error('Forward-only migration: reverting would restore insecure activation paths and discard activation history. Restore a reviewed backup instead.');
  }
}
