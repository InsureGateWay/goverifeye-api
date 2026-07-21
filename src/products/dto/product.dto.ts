import { IsEnum, IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator'; import { PartialType } from '@nestjs/swagger';
import { PageQueryDto } from '../../common/page-query.dto';
import { ProductStatus } from '../product.model';
export class CreateProductDto {
  @IsString() @Length(2, 150) name!: string;
  @IsString() @Length(10, 2000) description!: string;
  @IsString() @Length(2, 100) form!: string;
  @IsString() @Length(2, 150) manufacturer!: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  @IsOptional() @IsUrl() verificationDocumentUrl?: string;
}
export class ProductQueryDto extends PageQueryDto { @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus; @IsIn(['name','status','createdAt','updatedAt','totalCodes','scanned']) override sortBy='updatedAt'; }
export class UpdateProductDto extends PartialType(CreateProductDto) {}
