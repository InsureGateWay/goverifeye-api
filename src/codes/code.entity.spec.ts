import { DataSource } from 'typeorm';

import {
  CodeBatchEntity,
  CodeNamespaceEntity,
  OpenMarketBatchEntity,
  OpenMarketClaimEntity,
  ScanSessionEntity,
  VerificationCodeEntity,
  VerificationEventEntity,
} from './code.entity';

describe('code entity metadata', () => {
  it('builds valid PostgreSQL metadata for nullable credential hashes', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      entities: [
        CodeNamespaceEntity,
        CodeBatchEntity,
        VerificationCodeEntity,
        OpenMarketBatchEntity,
        OpenMarketClaimEntity,
        VerificationEventEntity,
        ScanSessionEntity,
      ],
    });

    await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

    expect(dataSource.getMetadata(CodeBatchEntity).findColumnWithPropertyName('activationPinDigest')?.type).toBe('char');
    expect(dataSource.getMetadata(VerificationEventEntity).findColumnWithPropertyName('submittedCodeHash')?.type).toBe('varchar');
  });
});
