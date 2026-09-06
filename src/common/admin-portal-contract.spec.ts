import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrganizationListQueryDto } from '../approvals/approval.dto';
import { FraudCaseQueryDto } from '../governance/governance.dto';
import { PlatformGenerateBatchDto } from '../platform/platform-generate-code.dto';
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

  it('accepts code generation with the selected vendor product', async () => {
    const dto = plainToInstance(PlatformGenerateBatchDto, {
      productId: '9e38c56a-cdf2-4dc4-aa88-ea7cbff2fadd',
      labels: ['micro'],
      quantity: 5000,
      vendorId: '319968e2-458f-440e-8c68-91dcf8261c07',
      vendorName: 'Verified Goods Ltd',
      unitPrice: 14.25,
      estimatedCost: 71250,
    });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(dto.productId).toBe('9e38c56a-cdf2-4dc4-aa88-ea7cbff2fadd');
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
