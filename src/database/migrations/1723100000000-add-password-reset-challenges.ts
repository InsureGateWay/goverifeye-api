import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddPasswordResetChallenges1723100000000 implements MigrationInterface {
  async up(query: QueryRunner) {
    await query.createTable(new Table({
      name: 'password_reset_challenges',
      columns: [
        {name:'id',type:'uuid',isPrimary:true,isGenerated:true,generationStrategy:'uuid'},
        {name:'createdAt',type:'timestamp',default:'CURRENT_TIMESTAMP'},
        {name:'updatedAt',type:'timestamp',default:'CURRENT_TIMESTAMP'},
        {name:'version',type:'int',default:1},
        {name:'userId',type:'uuid'},
        {name:'email',type:'varchar'},
        {name:'codeHash',type:'varchar'},
        {name:'expiresAt',type:'timestamp'},
        {name:'attempts',type:'int',default:0},
        {name:'consumed',type:'boolean',default:false},
      ],
    }));
    await query.createIndex('password_reset_challenges',new TableIndex({name:'IDX_password_reset_user_created',columnNames:['userId','createdAt']}));
    await query.createIndex('password_reset_challenges',new TableIndex({name:'IDX_password_reset_email_created',columnNames:['email','createdAt']}));
  }
  async down(query: QueryRunner) {
    await query.dropTable('password_reset_challenges',true);
  }
}
