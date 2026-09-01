import { MigrationInterface, QueryRunner, Table, TableCheck, TableForeignKey, TableIndex } from 'typeorm';

const audit=[{name:'id',type:'uuid',isPrimary:true,isGenerated:true,generationStrategy:'uuid'as const},{name:'createdById',type:'uuid'},{name:'updatedById',type:'uuid'},{name:'createdAt',type:'timestamptz',default:'CURRENT_TIMESTAMP'},{name:'updatedAt',type:'timestamptz',default:'CURRENT_TIMESTAMP'},{name:'deletedAt',type:'timestamptz',isNullable:true},{name:'version',type:'int',default:1}];
export class AddManagedEmailTemplates1724500000000 implements MigrationInterface{
 async up(q:QueryRunner){
  await q.createTable(new Table({name:'email_templates',columns:[...audit,{name:'key',type:'text'},{name:'name',type:'text'},{name:'audience',type:'varchar',length:'24'},{name:'status',type:'varchar',length:'24',default:"'draft'"},{name:'versionNumber',type:'int'},{name:'subjectTemplate',type:'text'},{name:'textTemplate',type:'text'},{name:'htmlTemplate',type:'text'},{name:'requiredVariables',type:'jsonb',default:"'[]'::jsonb"},{name:'description',type:'text',isNullable:true},{name:'isSystem',type:'boolean',default:true},{name:'activatedAt',type:'timestamptz',isNullable:true},{name:'activatedById',type:'uuid',isNullable:true}]}));
  await q.createTable(new Table({name:'email_template_history',columns:[...audit,{name:'templateId',type:'uuid'},{name:'key',type:'text'},{name:'action',type:'varchar',length:'24'},{name:'snapshot',type:'jsonb'},{name:'reason',type:'text'}]}));
  for(const table of ['email_templates','email_template_history'])for(const column of ['createdById','updatedById']){await q.createIndex(table,new TableIndex({name:`IDX_${table}_${column}`,columnNames:[column]}));await q.createForeignKey(table,new TableForeignKey({name:`FK_${table}_${column}`,columnNames:[column],referencedTableName:'users',referencedColumnNames:['id'],onDelete:'RESTRICT'}));}
  await q.createIndex('email_templates',new TableIndex({name:'IDX_email_template_key_status_version',columnNames:['key','status','versionNumber']}));
  await q.createIndex('email_templates',new TableIndex({name:'IDX_email_template_audience_status_updated',columnNames:['audience','status','updatedAt']}));
  await q.createIndex('email_template_history',new TableIndex({name:'IDX_email_template_history_template_created',columnNames:['templateId','createdAt']}));
  await q.createForeignKey('email_template_history',new TableForeignKey({name:'FK_email_template_history_template',columnNames:['templateId'],referencedTableName:'email_templates',referencedColumnNames:['id'],onDelete:'RESTRICT'}));
  await q.createForeignKey('email_templates',new TableForeignKey({name:'FK_email_templates_activated_by',columnNames:['activatedById'],referencedTableName:'users',referencedColumnNames:['id'],onDelete:'RESTRICT'}));
  await q.createCheckConstraint('email_templates',new TableCheck({name:'CHK_email_template_audience',expression:`"audience" IN ('vendor','platform_admin','staff','customer','security')`}));
  await q.createCheckConstraint('email_templates',new TableCheck({name:'CHK_email_template_status',expression:`"status" IN ('draft','active','archived')`}));
  await q.createCheckConstraint('email_template_history',new TableCheck({name:'CHK_email_template_history_action',expression:`"action" IN ('create','revise','activate','archive')`}));
  await q.query(`CREATE UNIQUE INDEX "UQ_email_template_version" ON "email_templates" ("key", "versionNumber") WHERE "deletedAt" IS NULL`);
  await q.query(`CREATE UNIQUE INDEX "UQ_email_template_active" ON "email_templates" ("key") WHERE "status" = 'active' AND "deletedAt" IS NULL`);
 }
 async down(q:QueryRunner){await q.dropTable('email_template_history',true);await q.dropTable('email_templates',true);}
}
