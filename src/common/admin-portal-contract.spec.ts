import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrganizationListQueryDto } from '../approvals/approval.dto';
import { FraudCaseQueryDto } from '../governance/governance.dto';
import { OpenMarketLookupDto, OpenMarketVerifyDto } from '../codes/code.dto';
import {
  PlatformGenerateBatchDto,
  PlatformGenerateOpenMarketBatchDto,
} from '../platform/platform-generate-code.dto';
import { TeamRole, UpdateMemberDto } from '../team/team.dto';

describe('admin portal request contracts', () => {
  it('accepts the fraud date-range filters sent by the admin portal', async () => {
    const dto = plainToInstance(FraudCaseQueryDto, {
      from: '2026-08-01',
      to: '2026-09-06',
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('accepts code generation assigned to a vendor without a product', async () => {
    const dto = plainToInstance(PlatformGenerateBatchDto, {
      labels: ['micro'],
      quantity: 5000,
      vendorId: '319968e2-458f-440e-8c68-91dcf8261c07',
      vendorName: 'Verified Goods Ltd',
      unitPrice: 14.25,
      estimatedCost: 71250,
    });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('accepts open-market generation without vendor or product fields', async () => {
    const dto = plainToInstance(PlatformGenerateOpenMarketBatchDto, {
      labels: ['micro', 'main'],
      quantity: 5000,
      unitPrice: 14.25,
      estimatedCost: 71250,
    });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('rejects vendor fields on the open-market generation contract', async () => {
    const dto = plainToInstance(PlatformGenerateOpenMarketBatchDto, {
      labels: ['micro'],
      quantity: 5000,
      vendorId: '319968e2-458f-440e-8c68-91dcf8261c07',
    });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
  });

  it('accepts the Open Market pack and lot activation contracts', async () => {
    const lookup = plainToInstance(OpenMarketLookupDto, {
      batchId: '8567-5654-8645-9875',
      activationCode: '6543 2109',
    });
    const verify = plainToInstance(OpenMarketVerifyDto, {
      code: '123456',
      productBatchReference: 'LOT-2026-001',
      manufacturingDate: '2026-09-01',
      expiryDate: '2028-09-01',
    });

    expect(await validate(lookup, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(await validate(verify, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('rejects incomplete Open Market activation credentials', async () => {
    const lookup = plainToInstance(OpenMarketLookupDto, {
      batchId: '8567-5654',
      activationCode: '654321',
    });

    expect(await validate(lookup, { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
  });

  it('accepts deactivated as an organization status filter', async () => {
    const dto = plainToInstance(OrganizationListQueryDto, { status: 'deactivated' });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it.each([TeamRole.PlatformAdmin, TeamRole.PlatformStaff])(
    'accepts the backend platform-team role %s',
    async (role) => {
      const dto = plainToInstance(UpdateMemberDto, {
        firstName: 'Ada',
        lastName: 'Okafor',
        role,
      });

      expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    },
  );
});
