import { DataSource } from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import type { RequestContext } from '../common/request-context';
import { CodeBatchEntity, OpenMarketBatchEntity } from '../codes/code.entity';
import { LabelType } from '../codes/code.enums';
import { CodesService } from '../codes/codes.service';
import { AuditLogEntity } from '../operations/operations.entity';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductStatus } from '../products/product.model';
import { PricingService } from '../commerce/pricing.service';
import { PlatformGenerateCodeService } from './platform-generate-code.service';

describe('PlatformGenerateCodeService open-market generation', () => {
  it('atomically pre-generates an unassigned batch and returns its activation code once', async () => {
    const platform = { id: 'a753f90f-74b6-48a3-9144-2e051747e48b' };
    const product = {
      id: '8fd37c34-e71c-47cb-a35a-f893aca30fa0',
      organizationId: platform.id,
      name: 'General Product',
      status: ProductStatus.Active,
    };
    const batch = {
      id: '01992daf-f5e7-7c8d-ae14-86ed035b1885',
      batchReference: 'CB-7K4M9X2PR6',
      activationMode: 'controlled_physical_print',
      createdAt: new Date('2026-09-06T12:00:00Z'),
    } as CodeBatchEntity;
    const productRepository = {
      findOneBy: jest.fn().mockResolvedValue(product),
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(null),
      exists: jest.fn().mockResolvedValue(false),
      getRepository: jest.fn((entity) => {
        if (entity === ProductEntity) return productRepository;
        throw new Error(`Unexpected repository ${String(entity)}`);
      }),
      create: jest.fn((entity, value) => ({
        ...value,
        ...(entity === OpenMarketBatchEntity
          ? { id: '6a39b3a4-4650-462a-941d-f8dc6bbbf2eb' }
          : {}),
      })),
      save: jest.fn((_entity, value) => Promise.resolve(value)),
    };
    const dataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === OrganizationEntity) {
          return { findOneBy: jest.fn().mockResolvedValue(platform) };
        }
        if (entity === UserEntity) {
          return {
            findOneBy: jest.fn().mockResolvedValue({
              firstName: 'Pee',
              lastName: 'Sarhmy',
            }),
          };
        }
        throw new Error(`Unexpected repository ${String(entity)}`);
      }),
      transaction: jest.fn((work) => work(manager)),
    } as unknown as DataSource;
    const codes = {
      generateBatchInTransaction: jest.fn().mockResolvedValue({ batch }),
    } as unknown as CodesService;
    const pricing = {
      getUnitPrice: jest.fn().mockResolvedValue(14.25),
    } as unknown as PricingService;
    const service = new PlatformGenerateCodeService(dataSource, codes, pricing);
    const actor: RequestContext = {
      userId: '38eb94ee-864f-45c0-9f6b-2aba97214824',
      organizationId: '579c54bd-ea92-40fe-b43b-5439ba714d8d',
      sessionId: '569de6ca-7943-490f-8436-327bb8edbafa',
      role: 'platform_admin',
    };

    const result = await service.createOpenMarketBatch(
      actor,
      { labels: ['micro'], quantity: 5000 },
      'admin-request-123',
    );

    expect(codes.generateBatchInTransaction).toHaveBeenCalledWith(
      manager,
      platform.id,
      actor.userId,
      expect.objectContaining({
        productId: product.id,
        labelType: LabelType.Micro,
        quantity: 5000,
      }),
      expect.stringMatching(/^open-market:/),
    );
    expect(manager.save).toHaveBeenCalledWith(
      OpenMarketBatchEntity,
      expect.objectContaining({
        claimedCodeBatchId: batch.id,
        status: 'available',
        quantity: 5000,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      AuditLogEntity,
      expect.objectContaining({ action: 'platform.open_market_batch.generated' }),
    );
    expect(result).toMatchObject({
      mode: 'open_market',
      quantity: 5000,
      vendorName: 'Unassigned - any approved vendor',
      status: 'awaiting_activation',
      replayed: false,
    });
    expect(result.batchId).toMatch(/^\d{4}(?:-\d{4}){3}$/);
    expect(result.activationCode).toMatch(/^\d{4} \d{4}$/);
  });
});
