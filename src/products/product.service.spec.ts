import { ProductStatus } from './product.model'; import { ProductRepository } from './product.repository'; import { ProductService } from './product.service';
describe('ProductService', () => {
  const repository: jest.Mocked<ProductRepository> = { find: jest.fn(), findById: jest.fn(), save: jest.fn(), delete: jest.fn() };
  const service = new ProductService(repository);
  beforeEach(() => jest.clearAllMocks());
  it('creates a pending product scoped to its organization', async () => {
    repository.save.mockImplementation(async product => product);
    const result = await service.create('org-1', 'user-1', { name: 'Pain Relief', description: 'A registered pain relief product', form: 'Tablet', manufacturer: 'Acme Pharma' });
    expect(result.status).toBe(ProductStatus.Pending); expect(result.organizationId).toBe('org-1'); expect(repository.save).toHaveBeenCalledTimes(1);
  });
  it('archives an existing product', async () => {
    const product = { id: 'p1', organizationId: 'org-1', name: 'P', description: 'description', form: 'Tablet', manufacturer: 'M', status: ProductStatus.Active, totalCodes: 2, scanned: 0, suspicious: 0, createdBy: 'u1', createdAt: new Date(), updatedAt: new Date() };
    repository.findById.mockResolvedValue(product); repository.save.mockImplementation(async value => value);
    const archived=await service.archive('p1','org-1');expect(archived.status).toBe(ProductStatus.Archived);expect(archived.statusBeforeArchive).toBe(ProductStatus.Active);
  });
  it('restores the product to its pre-archive approval status',async()=>{
    const product={id:'p1',organizationId:'org-1',name:'P',description:'description',form:'Tablet',manufacturer:'M',status:ProductStatus.Archived,statusBeforeArchive:ProductStatus.Rejected,totalCodes:0,scanned:0,suspicious:0,createdBy:'u1',createdAt:new Date(),updatedAt:new Date()};
    repository.findById.mockResolvedValue(product);repository.save.mockImplementation(async value=>value);
    expect((await service.restore('p1','org-1')).status).toBe(ProductStatus.Rejected);
  });
  it('returns a conflict instead of a server error for invalid lifecycle transitions',async()=>{
    const product={id:'p1',organizationId:'org-1',name:'P',description:'description',form:'Tablet',manufacturer:'M',status:ProductStatus.Archived,totalCodes:0,scanned:0,suspicious:0,createdBy:'u1',createdAt:new Date(),updatedAt:new Date()};
    repository.findById.mockResolvedValue(product);
    await expect(service.update('p1','org-1',{name:'Changed'})).rejects.toMatchObject({code:'PRODUCT_STATE_INVALID',status:409});
  });
});
