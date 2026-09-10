import { UserRole } from '../auth/authorization';
import { AuditLogEntity } from '../operations/operations.entity';
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
    };
    const auditRepo = {
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === OrganizationChangeRequestEntity ? requestRepo : auditRepo,
      ),
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
        requestedChanges: { address: 'New address' },
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
  });
});
