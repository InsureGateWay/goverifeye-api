import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotFoundDomainError } from '../common/domain-error.filter';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';
import { Product, ProductStatus } from './product.model';
import { PRODUCT_REPOSITORY, ProductRepository } from './product.repository';
import { DomainError } from '../common/domain-error';
@Injectable()
export class ProductService {
  constructor(@Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository) {}
  list(organizationId: string, query: ProductQueryDto) { return this.products.find({ organizationId, ...query }); }
  async create(organizationId: string, actorId: string, dto: CreateProductDto) {
    const now = new Date();
    const product: Product = { id: randomUUID(), organizationId, ...dto, status: ProductStatus.Pending,
      totalCodes: 0, scanned: 0, suspicious: 0, createdBy: actorId, createdAt: now, updatedAt: now };
    return this.products.save(product);
  }
  async archive(id: string, organizationId: string) {
    const product = await this.products.findById(id, organizationId);
    if (!product) throw new NotFoundDomainError('Product');
    if(product.status===ProductStatus.Archived)throw new DomainError('Product is already archived','PRODUCT_STATE_INVALID',409);
    return this.products.save({ ...product, statusBeforeArchive:product.status, status: ProductStatus.Archived, updatedAt: new Date() });
  }
  async get(id: string, organizationId: string) { const product = await this.products.findById(id, organizationId); if (!product) throw new NotFoundDomainError('Product'); return product; }
  async update(id: string, organizationId: string, dto: UpdateProductDto) { const product = await this.get(id, organizationId); if (product.status === ProductStatus.Archived) throw new DomainError('Archived products must be restored before editing','PRODUCT_STATE_INVALID',409);if(product.status===ProductStatus.Rejected)throw new DomainError('Rejected products must be resubmitted for approval','PRODUCT_STATE_INVALID',409); return this.products.save({ ...product, ...dto, updatedAt: new Date() }); }
  async restore(id: string, organizationId: string) { const product = await this.get(id, organizationId);if(product.status!==ProductStatus.Archived)throw new DomainError('Only archived products can be restored','PRODUCT_STATE_INVALID',409);const restoredStatus=product.statusBeforeArchive&&product.statusBeforeArchive!==ProductStatus.Archived?product.statusBeforeArchive:ProductStatus.Pending; return this.products.save({ ...product, status:restoredStatus,statusBeforeArchive:null, updatedAt: new Date() }); }
  async resubmit(id: string, organizationId: string, dto: UpdateProductDto) { const product = await this.get(id, organizationId); if (product.status !== ProductStatus.Rejected) throw new DomainError('Only rejected products can be resubmitted','PRODUCT_STATE_INVALID',409); return this.products.save({ ...product, ...dto, status: ProductStatus.Pending, rejectionReason: undefined, updatedAt: new Date() }); }
  async delete(id: string, organizationId: string) { const product = await this.get(id, organizationId); if (product.totalCodes > 0) throw new DomainError('Products with generated codes cannot be deleted','PRODUCT_HAS_CODES',409); await this.products.delete(id, organizationId); return { deleted: true }; }
}
