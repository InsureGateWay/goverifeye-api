import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotFoundDomainError } from '../common/domain-error.filter';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';
import { Product, ProductStatus } from './product.model';
import { PRODUCT_REPOSITORY, ProductRepository } from './product.repository';
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
    return this.products.save({ ...product, status: ProductStatus.Archived, updatedAt: new Date() });
  }
  async get(id: string, organizationId: string) { const product = await this.products.findById(id, organizationId); if (!product) throw new NotFoundDomainError('Product'); return product; }
  async update(id: string, organizationId: string, dto: UpdateProductDto) { const product = await this.get(id, organizationId); if (product.status === ProductStatus.Archived) throw new Error('Archived products must be restored before editing'); return this.products.save({ ...product, ...dto, updatedAt: new Date() }); }
  async restore(id: string, organizationId: string) { const product = await this.get(id, organizationId); return this.products.save({ ...product, status: ProductStatus.Active, updatedAt: new Date() }); }
  async resubmit(id: string, organizationId: string, dto: UpdateProductDto) { const product = await this.get(id, organizationId); if (product.status !== ProductStatus.Rejected) throw new Error('Only rejected products can be resubmitted'); return this.products.save({ ...product, ...dto, status: ProductStatus.Pending, rejectionReason: undefined, updatedAt: new Date() }); }
  async delete(id: string, organizationId: string) { const product = await this.get(id, organizationId); if (product.totalCodes > 0) throw new Error('Products with generated codes cannot be deleted'); await this.products.delete(id, organizationId); return { deleted: true }; }
}
