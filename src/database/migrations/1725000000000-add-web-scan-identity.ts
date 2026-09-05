import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
export class AddWebScanIdentity1725000000000 implements MigrationInterface {
  async up(q:QueryRunner){
    await q.addColumn('verification_events',new TableColumn({name:'scannerHash',type:'varchar',isNullable:true}));
    await q.createIndex('verification_events',new TableIndex({name:'IDX_verification_events_scanner_hash',columnNames:['scannerHash']}));
    await q.createTable(new Table({name:'scan_sessions',columns:[{name:'id',type:'uuid',isPrimary:true,isGenerated:true,generationStrategy:'uuid'},{name:'scannerHash',type:'varchar',isUnique:true},{name:'nonceHash',type:'varchar'},{name:'nonceExpiresAt',type:'timestamptz'},{name:'expiresAt',type:'timestamptz'},{name:'lastSeenAt',type:'timestamptz'},{name:'ipHash',type:'varchar',isNullable:true},{name:'userAgentHash',type:'varchar',isNullable:true},{name:'createdAt',type:'timestamp',default:'CURRENT_TIMESTAMP'},{name:'updatedAt',type:'timestamp',default:'CURRENT_TIMESTAMP'},{name:'version',type:'int',default:1}]}));
    await q.createIndex('scan_sessions',new TableIndex({name:'IDX_scan_sessions_expires_at',columnNames:['expiresAt']}));
  }
  async down(q:QueryRunner){await q.dropTable('scan_sessions',true);await q.dropIndex('verification_events','IDX_verification_events_scanner_hash');await q.dropColumn('verification_events','scannerHash')}
}
