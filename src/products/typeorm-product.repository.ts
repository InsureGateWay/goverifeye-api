import { Injectable } from '@nestjs/common'; import { InjectRepository } from '@nestjs/typeorm'; import { ILike, Repository } from 'typeorm';
import { pageOf } from '../common/api-response'; import { toOrder } from '../common/page-query.dto'; import { Product } from './product.model'; import { ProductEntity } from './product.entity'; import { ProductFilter, ProductRepository } from './product.repository';
@Injectable() export class TypeOrmProductRepository implements ProductRepository {
  constructor(@InjectRepository(ProductEntity) private readonly repository: Repository<ProductEntity>) {}
  async find(filter: ProductFilter) {
    const where = { organizationId: filter.organizationId, ...(filter.status ? { status: filter.status } : {}), ...(filter.search ? { name: ILike(`%${filter.search}%`) } : {}) };
    const order = toOrder(filter.sortBy, filter.sortDirection as never, ['name', 'status', 'createdAt', 'updatedAt', 'totalCodes', 'scanned'] as const, 'updatedAt');
    const [rows, total] = await this.repository.findAndCount({ where, skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize, order });
    return pageOf(rows, total, filter.page, filter.pageSize, filter.sortBy, filter.sortDirection);
  }
  async findById(id: string, organizationId: string) { return this.repository.findOneBy({ id, organizationId }); }
  async save(product: Product) { return this.repository.save(this.repository.create(product)); }
  async delete(id: string, organizationId: string) { return (await this.repository.delete({ id, organizationId })).affected === 1; }
}
