import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator'; import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
export class CreateProductImageUploadDto {
  @ApiProperty({example:'product.jpg'}) @IsString() @Length(1,200) fileName!:string;
  @ApiProperty({enum:['image/png','image/jpeg'],example:'image/jpeg'}) @IsIn(['image/png','image/jpeg']) mimeType!:string;
  @ApiProperty({example:524288,minimum:1,maximum:2097152}) @Type(()=>Number) @IsInt() @Min(1) @Max(2*1024*1024) size!:number;
}
export class CreateProductDocumentUploadDto {
  @ApiProperty({example:'product-certificate.pdf'}) @IsString() @Length(1,200) fileName!:string;
  @ApiProperty({enum:['application/pdf'],example:'application/pdf'}) @IsIn(['application/pdf']) mimeType!:string;
  @ApiProperty({example:1048576,minimum:1,maximum:12582912}) @Type(()=>Number) @IsInt() @Min(1) @Max(12*1024*1024) size!:number;
}
