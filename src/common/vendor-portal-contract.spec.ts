import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditQueryDto, NotificationQueryDto, UpdateCompanyDto } from '../operations/operations.dto';
import { TeamRole, TeamStatus, UpdateMemberDto } from '../team/team.dto';
import { BatchQueryDto, CodeQueryDto } from '../codes/code.dto';

describe('vendor portal request contracts', () => {
  it('accepts the complete team-member edit payload', async () => {
    const dto = plainToInstance(UpdateMemberDto, {
      firstName: 'Ada',
      lastName: 'Okafor',
      role: TeamRole.VendorStaff,
      status: TeamStatus.Active,
    });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('accepts the actor filter sent by the vendor audit screen', async () => {
    const dto = plainToInstance(AuditQueryDto, { actor: 'Ada Okafor' });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('preserves read=false when transforming notification filters', async () => {
    const dto = plainToInstance(NotificationQueryDto, { read: 'false' });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(dto.read).toBe(false);
  });

  it.each(['market_active', 'awaiting_activation', 'suspended'])(
    'accepts the vendor batch status filter %s',
    async (status) => {
      const dto = plainToInstance(BatchQueryDto, { status });

      expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    },
  );

  it('accepts every editable company-profile field sent by the vendor portal', async () => {
    const dto = plainToInstance(UpdateCompanyDto, {
      companyName: 'Verified Goods Ltd',
      industry: 'Pharmaceuticals',
      country: 'Nigeria',
      website: 'https://example.com',
      contactEmail: 'contact@example.com',
      contactPhone: '+2348012345678',
      address: {
        line1: '12 Verification Avenue',
        city: 'Ikeja',
        state: 'Lagos',
        lga: 'Ikeja',
        country: 'Nigeria',
        postalCode: '100001',
      },
    });

    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it.each(['market_active', 'allocated', 'revoked'])(
    'accepts the mapped vendor code status filter %s',
    async (status) => {
      const dto = plainToInstance(CodeQueryDto, { status });

      expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    },
  );
});
