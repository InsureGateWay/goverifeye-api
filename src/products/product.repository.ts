import { Page } from '../common/api-response';
import { Product, ProductStatus } from './product.model';
export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
export interface ProductFilter { organizationId: string; page: number; pageSize: number; search?: string; status?: ProductStatus; sortBy: string; sortDirection: 'asc' | 'desc' }
export interface ProductRepository {
  find(filter: ProductFilter): Promise<Page<Product>>;
  findById(id: string, organizationId: string): Promise<Product | null>;
  save(product: Product): Promise<Product>;
  delete(id: string, organizationId: string): Promise<boolean>;
}
