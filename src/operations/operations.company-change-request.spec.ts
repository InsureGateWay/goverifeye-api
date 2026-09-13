import { UserRole } from '../auth/authorization';
import { OperationsService } from './operations.service';

describe('OperationsService protected company fields', () => {
  const organization = {
    id: 'org-1',
    companyName: 'Old Company Limited',
    industry: 'Retail',
    country: 'Nigeria',
    website: 'https://old.example.com',
    administrator: { email: 'vendor@example.com', phone: '+2348000000000' },
    address: {
      line1: '1 Old Street',
      city: 'Lagos',
      state: 'Lagos',
      lga: 'Eti-Osa',
      country: 'Nigeria',
      postalCode: '100001',
    },
  };

  function setup() {
    const repo = {
      findOneBy: jest.fn().mockResolvedValue({ ...organization, address: { ...organization.address }, administrator: { ...organization.administrator } }),
      save: jest.fn(async (value) => value),
    };
    const db = { getRepository: jest.fn(() => repo) };
    return { service: new OperationsService(db as never), repo };
  }

  const user = { organizationId: 'org-1', userId: 'user-1', role: UserRole.VendorAdmin, sessionId: 'session-1' };
  const unchanged = {
    companyName: organization.companyName,
    industry: organization.industry,
    country: organization.country,
    address: { ...organization.address },
  };

  it('blocks a direct protected-field change', async () => {
    const { service, repo } = setup();
    await expect(service.updateCompany(user, { ...unchanged, companyName: 'Bypass Limited' }))
      .rejects.toMatchObject({ code: 'COMPANY_CHANGE_REQUEST_REQUIRED', status: 403 });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('still permits operational contact and website changes', async () => {
    const { service, repo } = setup();
    await service.updateCompany(user, {
      ...unchanged,
      website: 'https://new.example.com',
      contactEmail: 'CONTACT@example.com',
      contactPhone: '+2348111111111',
    });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      website: 'https://new.example.com',
      administrator: expect.objectContaining({ email: 'contact@example.com', phone: '+2348111111111' }),
    }));
  });
});
