import { MigrationInterface, QueryRunner, Table, TableCheck, TableForeignKey, TableIndex } from 'typeorm';

const auditColumns = [
  { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid' as const },
  { name: 'createdById', type: 'uuid' },
  { name: 'updatedById', type: 'uuid' },
  { name: 'createdAt', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
  { name: 'updatedAt', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
  { name: 'deletedAt', type: 'timestamptz', isNullable: true },
  { name: 'version', type: 'int', default: 1 },
];

export class AddGovernanceWorkflows1724400000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.createTable(new Table({ name:'organization_change_requests', columns:[...auditColumns,{name:'organizationId',type:'uuid'},{name:'details',type:'text'},{name:'requestedChanges',type:'jsonb',default:"'{}'::jsonb"},{name:'status',type:'varchar',length:'24',default:"'pending'"},{name:'reviewNotes',type:'text',isNullable:true},{name:'reviewedById',type:'uuid',isNullable:true},{name:'reviewedAt',type:'timestamptz',isNullable:true}] }));
    await q.createTable(new Table({ name:'user_mfa_factors', columns:[...auditColumns,{name:'userId',type:'uuid'},{name:'organizationId',type:'uuid'},{name:'type',type:'varchar',length:'16',default:"'totp'"},{name:'status',type:'varchar',length:'24',default:"'pending'"},{name:'encryptedSecret',type:'text'},{name:'recoveryCodeHashes',type:'jsonb',default:"'[]'::jsonb"},{name:'verifiedAt',type:'timestamptz',isNullable:true},{name:'lastUsedAt',type:'timestamptz',isNullable:true},{name:'failedAttempts',type:'int',default:0}] }));
    await q.createTable(new Table({ name:'mfa_login_challenges', columns:[...auditColumns,{name:'userId',type:'uuid'},{name:'organizationId',type:'uuid'},{name:'rememberMe',type:'boolean',default:false},{name:'consumed',type:'boolean',default:false},{name:'attempts',type:'int',default:0},{name:'expiresAt',type:'timestamptz'}] }));
    await q.createIndex('mfa_login_challenges',new TableIndex({name:'IDX_mfa_challenge_user_consumed_expires',columnNames:['userId','consumed','expiresAt']}));
    await q.createTable(new Table({ name:'vendor_invitations', columns:[...auditColumns,{name:'vendorName',type:'text'},{name:'contactPerson',type:'text'},{name:'email',type:'text'},{name:'status',type:'varchar',length:'24',default:"'pending'"},{name:'tokenHash',type:'text'},{name:'expiresAt',type:'timestamptz'},{name:'acceptedAt',type:'timestamptz',isNullable:true},{name:'revokedAt',type:'timestamptz',isNullable:true}] }));
    await q.createTable(new Table({ name:'vendor_status_history', columns:[...auditColumns,{name:'organizationId',type:'uuid'},{name:'fromStatus',type:'varchar',length:'32'},{name:'toStatus',type:'varchar',length:'32'},{name:'reason',type:'text',isNullable:true}] }));
    await q.createTable(new Table({ name:'fraud_cases', columns:[...auditColumns,{name:'organizationId',type:'uuid',isNullable:true},{name:'verificationEventId',type:'uuid',isNullable:true},{name:'category',type:'varchar',length:'100'},{name:'severity',type:'varchar',length:'16'},{name:'status',type:'varchar',length:'24',default:"'open'"},{name:'title',type:'text'},{name:'description',type:'text',isNullable:true},{name:'assignedToId',type:'uuid',isNullable:true},{name:'signals',type:'jsonb',default:"'{}'::jsonb"},{name:'resolvedAt',type:'timestamptz',isNullable:true}] }));
    await q.createTable(new Table({ name:'fraud_case_notes', columns:[...auditColumns,{name:'caseId',type:'uuid'},{name:'body',type:'text'},{name:'evidence',type:'jsonb',default:"'[]'::jsonb"}] }));
    await q.createTable(new Table({ name:'audit_exceptions', columns:[...auditColumns,{name:'auditLogId',type:'uuid',isNullable:true},{name:'organizationId',type:'uuid',isNullable:true},{name:'severity',type:'varchar',length:'16',default:"'medium'"},{name:'status',type:'varchar',length:'24',default:"'open'"},{name:'title',type:'text'},{name:'details',type:'text'},{name:'resolutionComment',type:'text',isNullable:true},{name:'evidence',type:'jsonb',default:"'[]'::jsonb"},{name:'resolvedById',type:'uuid',isNullable:true},{name:'resolvedAt',type:'timestamptz',isNullable:true}] }));
    await q.createTable(new Table({ name:'system_incidents', columns:[...auditColumns,{name:'title',type:'text'},{name:'component',type:'text'},{name:'severity',type:'varchar',length:'16'},{name:'status',type:'varchar',length:'24',default:"'investigating'"},{name:'description',type:'text',isNullable:true},{name:'startedAt',type:'timestamptz'},{name:'resolvedAt',type:'timestamptz',isNullable:true}] }));
    await q.createTable(new Table({ name:'system_components', columns:[...auditColumns,{name:'key',type:'text'},{name:'name',type:'text'},{name:'status',type:'varchar',length:'24',default:"'healthy'"},{name:'metadata',type:'jsonb',default:"'{}'::jsonb"},{name:'checkedAt',type:'timestamptz',isNullable:true}] }));
    await q.createIndex('system_components',new TableIndex({name:'UQ_system_components_key',columnNames:['key'],isUnique:true}));
    await q.createTable(new Table({ name:'application_options', columns:[...auditColumns,{name:'namespace',type:'text'},{name:'key',type:'text'},{name:'label',type:'text'},{name:'value',type:'jsonb'},{name:'valueType',type:'varchar',length:'16',default:"'string'"},{name:'organizationId',type:'uuid',isNullable:true},{name:'description',type:'text',isNullable:true},{name:'validation',type:'jsonb',default:"'{}'::jsonb"},{name:'isPublic',type:'boolean',default:false},{name:'isActive',type:'boolean',default:true},{name:'sortOrder',type:'int',default:0}] }));
    await q.createTable(new Table({ name:'application_option_history', columns:[...auditColumns,{name:'optionId',type:'uuid'},{name:'action',type:'varchar',length:'16'},{name:'snapshot',type:'jsonb'},{name:'reason',type:'text',isNullable:true}] }));
    await q.createIndex('application_options',new TableIndex({name:'IDX_options_namespace_active_order',columnNames:['namespace','isActive','sortOrder']}));
    await q.createIndex('application_option_history',new TableIndex({name:'IDX_option_history_option_created',columnNames:['optionId','createdAt']}));

    const indexes: Array<[string,string,string[]]> = [
      ['organization_change_requests','IDX_change_request_org_status_created',['organizationId','status','createdAt']],
      ['user_mfa_factors','IDX_mfa_user_status',['userId','status']],
      ['vendor_invitations','IDX_vendor_invite_email_status',['email','status']],
      ['vendor_status_history','IDX_vendor_history_org_created',['organizationId','createdAt']],
      ['fraud_cases','IDX_fraud_status_severity_created',['status','severity','createdAt']],
      ['fraud_cases','IDX_fraud_org_created',['organizationId','createdAt']],
      ['fraud_case_notes','IDX_fraud_notes_case_created',['caseId','createdAt']],
      ['audit_exceptions','IDX_audit_exception_status_severity_created',['status','severity','createdAt']],
      ['system_incidents','IDX_incident_status_started',['status','startedAt']],
    ];
    for(const [table,name,columns] of indexes) await q.createIndex(table,new TableIndex({name,columnNames:columns}));
    for(const table of ['organization_change_requests','user_mfa_factors','mfa_login_challenges','vendor_invitations','vendor_status_history','fraud_cases','fraud_case_notes','audit_exceptions','system_incidents','system_components','application_options','application_option_history']){
      await q.createIndex(table,new TableIndex({name:`IDX_${table}_created_by`,columnNames:['createdById']}));
      await q.createIndex(table,new TableIndex({name:`IDX_${table}_updated_by`,columnNames:['updatedById']}));
      await q.createForeignKey(table,new TableForeignKey({name:`FK_${table}_created_by`,columnNames:['createdById'],referencedTableName:'users',referencedColumnNames:['id'],onDelete:'RESTRICT'}));
      await q.createForeignKey(table,new TableForeignKey({name:`FK_${table}_updated_by`,columnNames:['updatedById'],referencedTableName:'users',referencedColumnNames:['id'],onDelete:'RESTRICT'}));
    }
    for(const [table,column,target] of [['organization_change_requests','organizationId','organizations'],['user_mfa_factors','userId','users'],['user_mfa_factors','organizationId','organizations'],['mfa_login_challenges','userId','users'],['mfa_login_challenges','organizationId','organizations'],['vendor_status_history','organizationId','organizations'],['fraud_case_notes','caseId','fraud_cases'],['application_option_history','optionId','application_options']] as const){
      await q.createForeignKey(table,new TableForeignKey({name:`FK_${table}_${column}`,columnNames:[column],referencedTableName:target,referencedColumnNames:['id'],onDelete:table==='fraud_case_notes'?'CASCADE':'RESTRICT'}));
      await q.createIndex(table,new TableIndex({name:`IDX_${table}_${column}`,columnNames:[column]}));
    }
    await q.query(`CREATE UNIQUE INDEX "UQ_vendor_invitations_pending_email" ON "vendor_invitations" (LOWER("email")) WHERE "status" = 'pending' AND "deletedAt" IS NULL`);
    await q.query(`CREATE UNIQUE INDEX "UQ_user_mfa_active" ON "user_mfa_factors" ("userId", "type") WHERE "status" = 'active' AND "deletedAt" IS NULL`);
    await q.query(`CREATE UNIQUE INDEX "UQ_application_options_global" ON "application_options" ("namespace", "key") WHERE "organizationId" IS NULL AND "deletedAt" IS NULL`);
    await q.query(`CREATE UNIQUE INDEX "UQ_application_options_org" ON "application_options" ("organizationId", "namespace", "key") WHERE "organizationId" IS NOT NULL AND "deletedAt" IS NULL`);
    const checks: Array<[string,string,string]> = [
      ['organization_change_requests','CHK_change_request_status',`"status" IN ('pending','approved','rejected')`],
      ['user_mfa_factors','CHK_mfa_factor_status',`"status" IN ('pending','active','disabled','superseded')`],
      ['vendor_invitations','CHK_vendor_invitation_status',`"status" IN ('pending','accepted','revoked','expired')`],
      ['fraud_cases','CHK_fraud_severity',`"severity" IN ('critical','high','medium','low')`],
      ['fraud_cases','CHK_fraud_status',`"status" IN ('open','investigating','contained','resolved','dismissed')`],
      ['audit_exceptions','CHK_audit_exception_severity',`"severity" IN ('high','medium','low')`],
      ['audit_exceptions','CHK_audit_exception_status',`"status" IN ('open','closed')`],
      ['system_incidents','CHK_system_incident_severity',`"severity" IN ('high','medium','low')`],
      ['system_incidents','CHK_system_incident_status',`"status" IN ('investigating','identified','monitoring','resolved')`],
      ['system_components','CHK_system_component_status',`"status" IN ('healthy','attention','critical','degraded')`],
      ['application_options','CHK_application_option_type',`"valueType" IN ('string','number','boolean','object','array')`],
      ['application_option_history','CHK_application_option_action',`"action" IN ('create','update','deactivate','activate','delete')`],
    ];
    for(const [table,name,expression] of checks) await q.createCheckConstraint(table,new TableCheck({name,expression}));
  }
  async down(q: QueryRunner) {
    for(const table of ['application_option_history','application_options','system_components','system_incidents','audit_exceptions','fraud_case_notes','fraud_cases','vendor_status_history','vendor_invitations','mfa_login_challenges','user_mfa_factors','organization_change_requests']) await q.dropTable(table,true);
  }
}
