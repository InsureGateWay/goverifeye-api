import { UserRole } from '../auth/authorization';
import { OrganizationDocumentEntity, OrganizationEntity } from '../onboarding/onboarding.entity';
import { DocumentQueryDto } from '../onboarding/onboarding.dto';
import { AuditLogEntity } from '../operations/operations.entity';
import { GovernanceService } from './governance.service';

describe('GovernanceService document management', () => {
  const actor = {
    userId: 'admin-id', organizationId: 'platform-id', sessionId: 'session-id',
    role: UserRole.SuperAdmin, email: 'admin@example.com', name: 'Super Admin',
  };

  function setup() {
    const pending = {
      id: 'document-id', organizationId: 'vendor-id', type: 'cac_certificate',
      fileName: 'certificate.pdf', mimeType: 'application/pdf', size: 9,
      storageKey: 'organizations/vendor-id/documents/document-certificate.pdf',
      status: 'pending_upload', uploadedBy: actor.userId,
    };
    const documents = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: value.id ?? pending.id })),
      findOneBy: jest.fn().mockResolvedValue(pending),
      findAndCount: jest.fn().mockResolvedValue([[{ ...pending, status: 'verified', sha256: 'hash' }], 1]),
    };
    const audits = { save: jest.fn(async (value) => value) };
    const db = {
      getRepository: jest.fn((entity) => {
        if (entity === OrganizationEntity) return { findOneBy: jest.fn().mockResolvedValue({ id: 'vendor-id', status: 'approved' }) };
        if (entity === OrganizationDocumentEntity) return documents;
        if (entity === AuditLogEntity) return audits;
        return {};
      }),
    };
    const storage = {
      signedUpload: jest.fn().mockResolvedValue({ signedUrl: 'https://upload.example/signed' }),
      signedDownload: jest.fn().mockResolvedValue({ signedUrl: 'https://download.example/signed' }),
      download: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
    };
    const security = { inspect: jest.fn().mockReturnValue({ sha256: 'verified-hash' }) };
    const malware = { assertClean: jest.fn().mockResolvedValue(undefined) };
    const service = new GovernanceService(
      db as never, {} as never, storage as never, security as never, malware as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    return { service, documents, audits, storage, security, malware };
  }

  it('creates a private vendor upload without returning its storage key', async () => {
    const { service, documents, storage, audits } = setup();
    const result = await service.createVendorDocument(actor, 'vendor-id', {
      type: 'cac_certificate', fileName: 'certificate.pdf', mimeType: 'application/pdf', size: 9,
    });
    expect(storage.signedUpload).toHaveBeenCalledWith(expect.stringMatching(/^organizations\/vendor-id\/documents\/.*-certificate\.pdf$/));
    expect(documents.save).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'vendor-id', uploadedBy: actor.userId, status: 'pending_upload' }));
    expect(result.document).not.toHaveProperty('storageKey');
    expect(audits.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'platform.vendor.document_upload_created' }));
  });

  it('scans an uploaded vendor document before marking it verified', async () => {
    const { service, documents, storage, security, malware, audits } = setup();
    const result = await service.completeVendorDocument(actor, 'vendor-id', 'document-id');
    expect(storage.download).toHaveBeenCalledWith(expect.stringContaining('organizations/vendor-id/documents/'));
    expect(security.inspect).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf', 9);
    expect(malware.assertClean).toHaveBeenCalled();
    expect(documents.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'verified', sha256: 'verified-hash' }));
    expect(result).not.toHaveProperty('storageKey');
    expect(audits.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'platform.vendor.document_added' }));
  });

  it('does not expose private storage metadata in the document list', async () => {
    const { service } = setup();
    const result = await service.listVendorDocuments('vendor-id', Object.assign(new DocumentQueryDto(), { page: 1, pageSize: 20, sortBy: 'createdAt', sortDirection: 'desc' as const }));
    expect(result.data[0]).not.toHaveProperty('storageKey');
    expect(result.data[0]).not.toHaveProperty('sha256');
  });
});
