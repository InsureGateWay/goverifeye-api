import { Injectable } from '@nestjs/common'; import { InjectRepository } from '@nestjs/typeorm'; import { And, ILike, In, Not, Repository } from 'typeorm';
import { UserEntity } from '../auth/auth.entity';
import { ASSIGNED_BATCH_PLACEHOLDER_PRODUCT } from '../codes/internal-products';
import { pageOf } from '../common/api-response'; import { toOrder } from '../common/page-query.dto'; import { Product } from './product.model'; import { ProductEntity } from './product.entity'; import { ProductFilter, ProductRepository } from './product.repository';
@Injectable() export class TypeOrmProductRepository implements ProductRepository {
  constructor(@InjectRepository(ProductEntity) private readonly repository: Repository<ProductEntity>,@InjectRepository(UserEntity)private readonly users:Repository<UserEntity>) {}
  async find(filter: ProductFilter) {
    const base={organizationId:filter.organizationId,...(filter.status?{status:filter.status}:{})};
    const visibleName = Not(ASSIGNED_BATCH_PLACEHOLDER_PRODUCT);
    const where=filter.search
      ? [
          {...base,name:And(ILike(`%${filter.search}%`),visibleName)},
          {...base,name:visibleName,manufacturer:ILike(`%${filter.search}%`)},
        ]
      : {...base,name:visibleName};
    const order = toOrder(filter.sortBy, filter.sortDirection as never, ['name', 'status', 'createdAt', 'updatedAt', 'totalCodes', 'scanned'] as const, 'updatedAt');
    const [rows, total] = await this.repository.findAndCount({ where, skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize, order });
    const creators=rows.length?await this.users.find({where:{id:In([...new Set(rows.map(row=>row.createdBy))])},select:{id:true,firstName:true,lastName:true,email:true,profileImageUrl:true}}):[];
    const byId=new Map(creators.map(user=>[user.id,user]));
    return pageOf(rows.map(row=>Object.assign(row,{createdByUser:byId.get(row.createdBy)})), total, filter.page, filter.pageSize, filter.sortBy, filter.sortDirection);
  }
  async findById(id: string, organizationId: string) { return this.repository.findOneBy({ id, organizationId }); }
  async save(product: Product) { return this.repository.save(this.repository.create(product)); }
  async delete(id: string, organizationId: string) { return (await this.repository.delete({ id, organizationId })).affected === 1; }
}
