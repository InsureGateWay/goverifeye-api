import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddShopperPasswordRegistration1725800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('shoppers', [
      new TableColumn({ name: 'displayName', type: 'varchar', length: '80', isNullable: true }),
      new TableColumn({ name: 'passwordHash', type: 'varchar', isNullable: true }),
    ]);
    await queryRunner.addColumns('shopper_challenges', [
      new TableColumn({ name: 'purpose', type: 'varchar', length: '24', default: "'login'" }),
      new TableColumn({ name: 'actionTokenHash', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'actionExpiresAt', type: 'timestamp', isNullable: true }),
      new TableColumn({ name: 'actionCompletedAt', type: 'timestamp', isNullable: true }),
    ]);
    await queryRunner.createIndex('shopper_challenges', new TableIndex({
      name: 'IDX_shopper_action_token',
      columnNames: ['actionTokenHash'],
      isUnique: true,
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('shopper_challenges', 'IDX_shopper_action_token');
    await queryRunner.dropColumns('shopper_challenges', ['actionCompletedAt', 'actionExpiresAt', 'actionTokenHash', 'purpose']);
    await queryRunner.dropColumns('shoppers', ['passwordHash', 'displayName']);
  }
}
