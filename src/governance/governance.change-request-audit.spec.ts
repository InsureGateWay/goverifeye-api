import { UserRole } from '../auth/authorization';
import { AuditLogEntity } from '../operations/operations.entity';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { OrganizationChangeRequestEntity } from './governance.entity';
import { GovernanceService } from './governance.service';

describe('GovernanceService change request auditing', () => {
  it('stores the request and its audit event atomically', async () => {
    const savedRequest = {
      id: '12345678-1234-4234-8234-123456789012',
      category: 'Organisation details',
      status: 'pending',
    };
    const requestRepo = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(savedRequest),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };
    const organizationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: '22345678-1234-4234-8234-123456789012',
        companyName: 'Old Company Limited',
        registrationNumber: 'RC-1234',
        industry: 'Retail',
        country: 'Nigeria',
        address: { line1: '1 Old Street', city: 'Lagos', state: 'Lagos', country: 'Nigeria', postalCode: '100001' },
        administrator: { email: 'vendor@example.com' },
      }),
    };
    const auditRepo = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === OrganizationChangeRequestEntity
          ? requestRepo
          : entity === OrganizationEntity
            ? organizationRepo
            : auditRepo,
      ),
      find: jest.fn().mockResolvedValue([]),
    };
    const db = {
      transaction: jest.fn(async (work) => work(manager)),
    };
    const service = new GovernanceService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.createChangeRequest(
      {
        organizationId: '22345678-1234-4234-8234-123456789012',
        userId: '32345678-1234-4234-8234-123456789012',
        role: UserRole.VendorAdmin,
        sessionId: 'session-1',
      },
      {
        category: ' Organisation details ',
        details: ' Update the registered address ',
        requestedChanges: { field: 'companyName', proposedValue: 'New Company Limited' },
      },
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledWith(AuditLogEntity);
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: '22345678-1234-4234-8234-123456789012',
        actorId: '32345678-1234-4234-8234-123456789012',
        action: 'organization.change_request.submitted',
        resourceType: 'organization_change_request',
        resourceId: savedRequest.id,
        status: 'success',
        metadata: expect.objectContaining({
          category: 'Organisation details',
          reference: 'CR-12345678',
        }),
      }),
    );
    expect(result).toMatchObject({
      id: savedRequest.id,
      reference: 'CR-12345678',
      status: 'pending',
    });
    expect(requestRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      category: 'Organisation details',
      requestedChanges: {
        field: 'companyName',
        fieldLabel: 'Legal business name',
        currentValue: 'Old Company Limited',
        proposedValue: 'New Company Limited',
      },
    }));
  });

  it('applies an approved value and emails the vendor and Super Admin when a platform admin reviews it', async () => {
    const request = {
      id: '12345678-1234-4234-8234-123456789012',
      organizationId: '22345678-1234-4234-8234-123456789012',
      createdById: 'vendor-1',
      category: 'Organisation details',
      details: 'Our legal name changed.',
      requestedChanges: {
        field: 'companyName',
        fieldLabel: 'Legal business name',
        currentValue: 'Old Company Limited',
        proposedValue: 'New Company Limited',
      },
      status: 'pending',
    };
    const organization = {
      id: request.organizationId,
      companyName: 'Old Company Limited',
      registrationNumber: 'RC-1234',
      industry: 'Retail',
      country: 'Nigeria',
      address: { line1: '1 Old Street', city: 'Lagos', state: 'Lagos', country: 'Nigeria', postalCode: '100001' },
      administrator: { firstName: 'Vendor', email: 'vendor@example.com' },
    };
    const requestRepo = {
      findOne: jest.fn().mockResolvedValue(request),
      save: jest.fn(async (value) => value),
    };
    const organizationRepo = {
      findOne: jest.fn().mockResolvedValue(organization),
      existsBy: jest.fn().mockResolvedValue(false),
      save: jest.fn(async (value) => value),
    };
    const vendor = { id: 'vendor-1', organizationId: request.organizationId, email: 'vendor@example.com', firstName: 'Vendor' };
    const superAdmin = { id: 'super-1', organizationId: 'platform-org', email: 'super@example.com', firstName: 'Super' };
    const manager = {
      getRepository: jest.fn((entity) => entity === OrganizationChangeRequestEntity ? requestRepo : organizationRepo),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => value),
      find: jest.fn(async (_entity, options) => options.where.role === UserRole.VendorAdmin ? [vendor] : [superAdmin]),
    };
    const db = { transaction: jest.fn(async (work) => work(manager)) };
    const reliability = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const emailTemplates = { render: jest.fn(async (_manager, _key, _variables, fallback) => fallback()) };
    const service = new GovernanceService(
      db as never, {} as never, {} as never, {} as never, {} as never,
      reliability as never, emailTemplates as never, {} as never, {} as never, {} as never,
    );

    const result = await service.reviewChangeRequest({
      organizationId: 'platform-org',
      userId: 'platform-admin-1',
      role: UserRole.PlatformAdmin,
      sessionId: 'session-2',
      email: 'reviewer@example.com',
      name: 'Platform Reviewer',
    }, request.id, 'approved', 'CAC document checked');

    expect(organizationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ companyName: 'New Company Limited' }));
    expect(result).toMatchObject({ status: 'approved', applied: true });
    expect(reliability.enqueue).toHaveBeenCalledWith(manager, 'email.send', 'change-request-approved', `${request.id}:vendor-1`, expect.objectContaining({ to: 'vendor@example.com' }));
    expect(reliability.enqueue).toHaveBeenCalledWith(manager, 'email.send', 'platform-change-request-approved', `${request.id}:super-1`, expect.objectContaining({ to: 'super@example.com' }));
    expect(manager.save).toHaveBeenCalledWith(AuditLogEntity, expect.objectContaining({
      action: 'organization.change_request.approved',
      metadata: expect.objectContaining({ previousValue: 'Old Company Limited', proposedValue: 'New Company Limited', applied: true }),
    }));
  });
});
