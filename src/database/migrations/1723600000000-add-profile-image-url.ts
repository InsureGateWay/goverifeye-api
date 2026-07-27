import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddProfileImageUrl1723600000000 implements MigrationInterface {
  async up(queryRunner:QueryRunner){
    await queryRunner.addColumn('users',new TableColumn({name:'profileImageUrl',type:'varchar',length:'1000',isNullable:true}))
  }
  async down(queryRunner:QueryRunner){
    await queryRunner.dropColumn('users','profileImageUrl')
  }
}
