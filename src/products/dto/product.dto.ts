import { IsEnum, IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator'; import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PageQueryDto } from '../../common/page-query.dto';
import { ProductStatus } from '../product.model';
export class CreateProductDto {
  @ApiProperty({example:'Verified Pain Relief Tablets'}) @IsString() @Length(2, 150) name!: string;
  @ApiProperty({example:'A registered pharmaceutical product supplied in sealed packs.'}) @IsString() @Length(10, 2000) description!: string;
  @ApiProperty({example:'Tablet'}) @IsString() @Length(2, 100) form!: string;
  @ApiProperty({example:'Example Pharmaceuticals Ltd'}) @IsString() @Length(2, 150) manufacturer!: string;
  @ApiPropertyOptional({example:'https://example.com/product.png'}) @IsOptional() @IsUrl() imageUrl?: string;
  @ApiPropertyOptional({example:'https://example.com/verification.pdf'}) @IsOptional() @IsUrl() verificationDocumentUrl?: string;
}
export class ProductQueryDto extends PageQueryDto { @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus; @IsIn(['name','status','createdAt','updatedAt','totalCodes','scanned']) override sortBy='updatedAt'; }
export class UpdateProductDto extends PartialType(CreateProductDto) {}
