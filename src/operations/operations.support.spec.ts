import { getMetadataArgsStorage, In } from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import { CustomerSupportRequestEntity } from '../customer/customer.entity';
import { OrganizationEntity } from '../onboarding/onboarding.entity';
import { AuditLogEntity } from './operations.entity';
import { OperationsService } from './operations.service';

describe('OperationsService contact support', () => {
  it('declares nullable attachment columns with PostgreSQL-supported types', () => {
    const columns = getMetadataArgsStorage().columns.filter(column => column.target === CustomerSupportRequestEntity);
    for (const propertyName of ['attachmentName', 'attachmentMimeType', 'attachmentSha256']) {
      expect(columns.find(column => column.propertyName === propertyName)?.options.type).toBe('varchar');
    }
  });
  it('emails every active platform administrator, receipts the vendor, and records an audit event', async () => {
    const now = new Date();
    const user = { id: 'vendor-user', organizationId: 'vendor-org', email: 'vendor@example.com', firstName: 'Ada', lastName: 'Okafor', role: 'vendor_admin', isActive: true };
    const repositories = new Map<unknown, unknown>([
      [UserEntity, { findOneBy: jest.fn(async () => user) }],
      [OrganizationEntity, { findOneBy: jest.fn(async () => ({ id: 'vendor-org', companyName: 'Verified Goods' })) }],
      [CustomerSupportRequestEntity, { findOneBy: jest.fn(async () => null) }],
    ]);
    const manager = {
      find: jest.fn(async () => [{ id: 'admin-1', email: 'platform@example.com' }, { id: 'admin-2', email: 'super@example.com' }]),
      create: jest.fn((_type, value) => value),
      save: jest.fn(async (type, value) => type === CustomerSupportRequestEntity ? { ...value, id: 'support-id', createdAt: now } : value),
    };
    const db = { getRepository: jest.fn(type => repositories.get(type)), transaction: jest.fn(async callback => callback(manager)) };
    const reliability = { enqueue: jest.fn(async () => undefined) };
    const service = new OperationsService(db as never, reliability as never);

    const result = await service.contactSupport({ userId: user.id, organizationId: user.organizationId, role: user.role, sessionId: 'session' }, {
      requestId: '7d12c6f2-444f-42a9-9a55-bf16ad269cf4', subject: 'Activation assistance', message: 'Please help us activate the assigned batch.',
      attachmentName: 'batch.png', attachmentMimeType: 'image/png', attachmentBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64'),
    });

    expect(result).toEqual({ reference: 'support-id', submittedAt: now.toISOString() });
    expect(manager.find).toHaveBeenCalledWith(UserEntity, expect.objectContaining({ where: { role: In(['platform_admin', 'super_admin']), isActive: true } }));
    expect(reliability.enqueue).toHaveBeenCalledTimes(3);
    expect(reliability.enqueue).toHaveBeenCalledWith(manager, 'email.send', 'vendor-support-admin', 'support-id:admin-1', expect.objectContaining({ to: 'platform@example.com', replyTo: user.email, attachments: [expect.objectContaining({ filename: 'batch.png' })] }));
    expect(reliability.enqueue).toHaveBeenCalledWith(manager, 'email.send', 'vendor-support-receipt', 'support-id:receipt', expect.objectContaining({ to: user.email }));
    expect(manager.save).toHaveBeenCalledWith(AuditLogEntity, expect.objectContaining({ action: 'support.requested', resourceType: 'support_request', actorId: user.id }));
  });
});
