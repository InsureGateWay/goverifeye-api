import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddCodeTraceabilityMetadata1723800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.addColumns('code_batches', [
      new TableColumn({ name: 'manufacturingDate', type: 'date', isNullable: true }),
      new TableColumn({ name: 'expiryDate', type: 'date', isNullable: true }),
    ])
    await queryRunner.addColumns('verification_events', [
      new TableColumn({ name: 'ipAddress', type: 'varchar', length: '45', isNullable: true }),
      new TableColumn({ name: 'customerComplaint', type: 'varchar', length: '500', isNullable: true }),
    ])
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.dropColumns('verification_events', ['customerComplaint', 'ipAddress'])
    await queryRunner.dropColumns('code_batches', ['expiryDate', 'manufacturingDate'])
  }
}
