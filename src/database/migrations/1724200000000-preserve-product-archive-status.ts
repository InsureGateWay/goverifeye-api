import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class PreserveProductArchiveStatus1724200000000 implements MigrationInterface {
  async up(queryRunner:QueryRunner){
    await queryRunner.addColumn('products',new TableColumn({
      name:'statusBeforeArchive',
      type:'varchar',
      length:'20',
      isNullable:true,
    }));
  }
  async down(queryRunner:QueryRunner){
    await queryRunner.dropColumn('products','statusBeforeArchive');
  }
}
