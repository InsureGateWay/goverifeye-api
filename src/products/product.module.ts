import { Module } from '@nestjs/common'; import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductController } from './product.controller';
import { PRODUCT_REPOSITORY } from './product.repository';
import { ProductService } from './product.service';
import { ProductImageStorageService } from './product-image-storage.service';
import { ProductEntity } from './product.entity'; import { TypeOrmProductRepository } from './typeorm-product.repository';
@Module({ imports: [TypeOrmModule.forFeature([ProductEntity])], controllers: [ProductController], providers: [ProductService,ProductImageStorageService, { provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository }], exports: [ProductService] })
export class ProductModule {}
