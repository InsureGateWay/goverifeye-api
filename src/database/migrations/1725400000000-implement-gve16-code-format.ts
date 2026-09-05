import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

const baseColumns=[
  {name:'id',type:'uuid',isPrimary:true,isGenerated:true,generationStrategy:'uuid' as const},
  {name:'createdAt',type:'timestamp',default:'CURRENT_TIMESTAMP'},
  {name:'updatedAt',type:'timestamp',default:'CURRENT_TIMESTAMP'},
  {name:'version',type:'int',default:1},
];

export class ImplementGve16CodeFormat1725400000000 implements MigrationInterface{
  async up(q:QueryRunner):Promise<void>{
    await q.query(`CREATE SEQUENCE IF NOT EXISTS gve_namespace_sequence MINVALUE 1000 MAXVALUE 9999 START 1000 NO CYCLE`);
    await q.createTable(new Table({name:'code_namespaces',columns:[...baseColumns,{name:'organizationId',type:'uuid',isUnique:true},{name:'namespace',type:'char',length:'4',isUnique:true},{name:'nextSerial',type:'bigint',default:'1'}]}));
    await q.createIndex('code_namespaces',new TableIndex({name:'IDX_code_namespaces_organization',columnNames:['organizationId'],isUnique:true}));
    await q.createIndex('code_namespaces',new TableIndex({name:'IDX_code_namespaces_namespace',columnNames:['namespace'],isUnique:true}));
    await q.query(`ALTER TABLE code_namespaces ADD CONSTRAINT "CHK_code_namespace_digits" CHECK (namespace ~ '^[0-9]{4}$')`);

    for(const column of [
      new TableColumn({name:'activationMode',type:'varchar',default:"'self_print_digital'"}),
      new TableColumn({name:'activationCredentialHash',type:'varchar',isNullable:true}),
      new TableColumn({name:'activationAttempts',type:'int',default:0}),
      new TableColumn({name:'activatedBy',type:'uuid',isNullable:true}),
    ])await q.addColumn('code_batches',column);
    const batchTable=await q.getTable('code_batches');
    if(!batchTable?.findColumnByName('activatedAt'))await q.addColumn('code_batches',new TableColumn({name:'activatedAt',type:'timestamp',isNullable:true}));

    await q.changeColumn('verification_codes','activationCodeHash',new TableColumn({name:'activationCodeHash',type:'varchar',length:'64',isNullable:true}));
    for(const column of [
      new TableColumn({name:'codeFormatVersion',type:'varchar',length:'16',isNullable:true}),
      new TableColumn({name:'keyVersion',type:'varchar',length:'16',isNullable:true}),
      new TableColumn({name:'namespace',type:'char',length:'4',isNullable:true}),
      new TableColumn({name:'internalSerial',type:'bigint',isNullable:true}),
      new TableColumn({name:'publicToken',type:'char',length:'7',isNullable:true}),
      new TableColumn({name:'luhnDigit',type:'char',length:'1',isNullable:true}),
      new TableColumn({name:'antiFabTag',type:'char',length:'4',isNullable:true}),
      new TableColumn({name:'allocationId',type:'uuid',isNullable:true}),
      new TableColumn({name:'productBatchId',type:'uuid',isNullable:true}),
      new TableColumn({name:'unitId',type:'uuid',isNullable:true}),
    ])await q.addColumn('verification_codes',column);
    await q.query(`CREATE OR REPLACE FUNCTION bind_gve16_unit() RETURNS trigger AS $$ BEGIN IF NEW."codeFormatVersion" IS NOT NULL THEN NEW."productBatchId" := COALESCE(NEW."productBatchId", NEW."batchId"); NEW."unitId" := COALESCE(NEW."unitId", NEW.id); END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER "TRG_bind_gve16_unit" BEFORE INSERT ON verification_codes FOR EACH ROW EXECUTE FUNCTION bind_gve16_unit()`);
    await q.query(`CREATE UNIQUE INDEX "UQ_gve16_namespace_serial" ON verification_codes (namespace,"internalSerial") WHERE namespace IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX "UQ_gve16_namespace_token" ON verification_codes (namespace,"publicToken") WHERE namespace IS NOT NULL`);
    await q.query(`CREATE INDEX "IDX_gve16_candidate" ON verification_codes (namespace,"publicToken")`);
    await q.createForeignKey('verification_codes',new TableForeignKey({name:'FK_gve16_allocation_batch',columnNames:['allocationId'],referencedTableName:'code_batches',referencedColumnNames:['id'],onDelete:'RESTRICT'}));
    await q.query(`ALTER TABLE verification_codes ADD CONSTRAINT "CHK_gve16_shape" CHECK ("codeFormatVersion" IS NULL OR ("codeFormatVersion"='3.3.3' AND code ~ '^[0-9]{16}$' AND namespace ~ '^[0-9]{4}$' AND "publicToken" ~ '^[0-9]{7}$' AND "luhnDigit" ~ '^[0-9]$' AND "antiFabTag" ~ '^[0-9]{4}$' AND "keyVersion" IS NOT NULL AND "allocationId" IS NOT NULL AND "productBatchId" IS NOT NULL AND "unitId" IS NOT NULL AND "allocationId"="batchId" AND "productBatchId"="batchId" AND "unitId"=id AND "internalSerial" BETWEEN 0 AND 9999999 AND code=namespace||"publicToken"||"luhnDigit"||"antiFabTag"))`);
    await q.query(`ALTER TABLE code_batches ADD CONSTRAINT "CHK_batch_activation_mode" CHECK ("activationMode" IN ('controlled_physical_print','self_print_digital'))`);
    await q.query(`ALTER TABLE verification_codes ALTER COLUMN status SET DEFAULT 'allocated'`);
    await q.query(`UPDATE verification_codes SET status='retired' WHERE "codeFormatVersion" IS NULL`);
    await q.query(`UPDATE code_batches SET status='retired' WHERE id IN (SELECT DISTINCT "batchId" FROM verification_codes WHERE "codeFormatVersion" IS NULL)`);
    await q.query(`UPDATE application_options SET "isActive"=false WHERE namespace='codes' AND key='verification_code_length'`);

    await q.changeColumn('verification_events','organizationId',new TableColumn({name:'organizationId',type:'uuid',isNullable:true}));
    await q.changeColumn('verification_events','productId',new TableColumn({name:'productId',type:'uuid',isNullable:true}));
    await q.changeColumn('verification_events','codeId',new TableColumn({name:'codeId',type:'uuid',isNullable:true}));
    await q.addColumn('verification_events',new TableColumn({name:'channel',type:'varchar',default:"'manual'"}));
    await q.addColumn('verification_events',new TableColumn({name:'submittedCodeHash',type:'varchar',isNullable:true}));
  }

  async down(q:QueryRunner):Promise<void>{
    await q.dropColumn('verification_events','submittedCodeHash');await q.dropColumn('verification_events','channel');
    await q.query(`DROP TRIGGER IF EXISTS "TRG_bind_gve16_unit" ON verification_codes`);await q.query(`DROP FUNCTION IF EXISTS bind_gve16_unit`);
    const codes=await q.getTable('verification_codes'),allocationKey=codes?.foreignKeys.find(key=>key.name==='FK_gve16_allocation_batch');if(allocationKey)await q.dropForeignKey('verification_codes',allocationKey);
    for(const name of ['unitId','productBatchId','allocationId','antiFabTag','luhnDigit','publicToken','internalSerial','namespace','keyVersion','codeFormatVersion'])await q.dropColumn('verification_codes',name);
    for(const name of ['activatedBy','activationAttempts','activationCredentialHash','activationMode'])await q.dropColumn('code_batches',name);
    await q.dropTable('code_namespaces',true);await q.query(`DROP SEQUENCE IF EXISTS gve_namespace_sequence`);
  }
}
