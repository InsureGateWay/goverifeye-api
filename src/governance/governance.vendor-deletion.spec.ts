import { UserEntity } from '../auth/auth.entity';
import { UserRole } from '../auth/authorization';
import { DomainError } from '../common/domain-error';
import { OrganizationDocumentEntity, OrganizationEntity } from '../onboarding/onboarding.entity';
import { ProductEntity } from '../products/product.entity';
import { VendorInvitationEntity } from './governance.entity';
import { GovernanceService } from './governance.service';

describe('GovernanceService vendor deletion', () => {
  const organization = {
    id: 'vendor-id', companyName: 'Example Vendor', logoUrl: null,
    administrator: { email: 'owner@example.com' },
  };

  function setup() {
    const repositories = new Map<unknown, Record<string, jest.Mock>>([
      [OrganizationEntity, { findOneBy: jest.fn().mockResolvedValue(organization) }],
      [UserEntity, {
        existsBy: jest.fn().mockResolvedValue(false),
        findBy: jest.fn().mockResolvedValue([{ id:'user-id', email:'owner@example.com' }]),
      }],
      [OrganizationDocumentEntity, { findBy: jest.fn().mockResolvedValue([]) }],
      [VendorInvitationEntity, { findBy: jest.fn().mockResolvedValue([]) }],
      [ProductEntity, { findBy: jest.fn().mockResolvedValue([]) }],
    ]);
    const manager = {
      findOne: jest.fn().mockResolvedValue(organization),
      query: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({ affected:1 }),
    };
    const db = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
      transaction: jest.fn((work) => work(manager)),
    };
    const service = new GovernanceService(
      db as never, {} as never, { remove:jest.fn() } as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
      { removeVendorLogo:jest.fn(), removeProductImage:jest.fn(), removeProductDocument:jest.fn() } as never,
      { runOnce:jest.fn() } as never,
    );
    return { service, db, manager };
  }

  const superAdmin = {
    userId:'super-id', organizationId:'platform-id', sessionId:'session-id',
    role:UserRole.SuperAdmin, email:'super@example.com', name:'Super Admin',
  };

  it('rejects permanent deletion by delegated platform roles', async () => {
    const { service, db } = setup();
    await expect(service.deleteVendor({ ...superAdmin, role:UserRole.PlatformAdmin }, 'vendor-id', 'Example Vendor'))
      .rejects.toBeInstanceOf(DomainError);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('requires an exact vendor-name confirmation', async () => {
    const { service, db } = setup();
    await expect(service.deleteVendor(superAdmin, 'vendor-id', 'example vendor'))
      .rejects.toMatchObject({ code:'VENDOR_DELETE_CONFIRMATION_INVALID' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('uses the controlled batch-delete guard and removes the organization last', async () => {
    const { service, manager } = setup();
    await expect(service.deleteVendor(superAdmin, 'vendor-id', 'Example Vendor'))
      .resolves.toEqual({ deleted:true, id:'vendor-id', companyName:'Example Vendor' });
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("set_config('app.allow_vendor_cascade_delete'"));
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM "code_batches"'), ['vendor-id']);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM "products"'), ['vendor-id']);
    expect(manager.delete).toHaveBeenCalledWith(OrganizationEntity, { id:'vendor-id' });
  });
});
