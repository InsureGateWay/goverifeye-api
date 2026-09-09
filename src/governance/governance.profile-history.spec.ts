import { DataSource } from 'typeorm';
import { OrganizationDocumentEntity, OrganizationEntity } from '../onboarding/onboarding.entity';
import {
  OrganizationChangeRequestEntity,
  VendorStatusHistoryEntity,
} from './governance.entity';
import { GovernanceService } from './governance.service';

describe('GovernanceService profile history', () => {
  it('loads only the authenticated organization records and returns newest events first', async () => {
    const joinedAt = new Date('2026-07-27T09:00:00.000Z');
    const approvedAt = new Date('2026-07-28T10:00:00.000Z');
    const requestedAt = new Date('2026-07-29T11:00:00.000Z');
    const reviewedAt = new Date('2026-07-30T12:00:00.000Z');
    const organizationRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'org-1',
        status: 'approved',
        createdAt: joinedAt,
        updatedAt: approvedAt,
      }),
    };
    const statusRepository = {
      find: jest.fn().mockResolvedValue([{
        id: 'status-1',
        fromStatus: 'submitted',
        toStatus: 'approved',
        reason: null,
        createdAt: approvedAt,
      }]),
    };
    const documentRepository = { find: jest.fn().mockResolvedValue([]) };
    const requestRepository = {
      find: jest.fn().mockResolvedValue([{
        id: 'request-1',
        category: 'Organisation details',
        details: 'Update the registered address',
        status: 'approved',
        reviewNotes: 'Verified against the supplied certificate',
        createdAt: requestedAt,
        reviewedAt,
      }]),
    };
    const repositories = new Map<unknown, unknown>([
      [OrganizationEntity, organizationRepository],
      [VendorStatusHistoryEntity, statusRepository],
      [OrganizationDocumentEntity, documentRepository],
      [OrganizationChangeRequestEntity, requestRepository],
    ]);
    const dataSource = {
      getRepository: jest.fn((entity: unknown) => repositories.get(entity)),
    } as unknown as DataSource;
    const service = new GovernanceService(
      dataSource,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );

    const result = await service.profileHistory('org-1');

    expect(organizationRepository.findOneBy).toHaveBeenCalledWith({ id: 'org-1' });
    for (const repository of [statusRepository, documentRepository, requestRepository]) {
      expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { organizationId: 'org-1' },
      }));
    }
    expect(result.joinedAt).toEqual(joinedAt);
    expect(result.lastUpdatedAt).toEqual(reviewedAt);
    expect(result.events.map((event) => event.type)).toEqual([
      'change_request_reviewed',
      'change_request_submitted',
      'status_changed',
      'organization_joined',
    ]);
    expect(result.events.filter((event) => event.title === 'Business review approved.')).toHaveLength(1);
  });
});
