import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { CurrentUser, RequestContext } from '../common/request-context';
import { ApiDomainConflict, ApiDomainNotFound, PageMetaDto } from '../common/swagger.dto';
import { CreateProductDto, CreateProductImageUploadDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';
import { ProductEntity } from './product.entity';
import { RequiresActivatedOrganization } from '../common/organization-activation.guard';
import { ProductService } from './product.service';
import { ProductImageStorageService } from './product-image-storage.service';
@ApiTags('products') @ApiBearerAuth() @ApiExtraModels(ProductEntity,PageMetaDto) @Controller('products')
export class ProductController {
  constructor(private readonly service: ProductService,private readonly images:ProductImageStorageService) {}
  @ApiOperation({summary:'List products'}) @ApiOkResponse({schema:{type:'object',properties:{data:{type:'array',items:{$ref:getSchemaPath(ProductEntity)}},meta:{$ref:getSchemaPath(PageMetaDto)}}}}) @Get() list(@CurrentUser() user: RequestContext, @Query() query: ProductQueryDto) { return this.service.list(user.organizationId, query); }
  @ApiOperation({summary:'Create a product'}) @ApiCreatedResponse({type:ProductEntity}) @RequiresActivatedOrganization() @Post() create(@CurrentUser() user: RequestContext, @Body() dto: CreateProductDto) { return this.service.create(user.organizationId, user.userId, dto); }
  @ApiOperation({summary:'Create a signed product image upload URL'}) @RequiresActivatedOrganization() @Post('image-upload') imageUpload(@CurrentUser()user:RequestContext,@Body()dto:CreateProductImageUploadDto){return this.images.createUpload(user.organizationId,dto.fileName)}
  @ApiOperation({summary:'Get a product'}) @ApiOkResponse({type:ProductEntity}) @ApiDomainNotFound('PRODUCT_NOT_FOUND','Product was not found') @Get(':id') get(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.service.get(id, user.organizationId); }
  @ApiOperation({summary:'Update a product'}) @ApiOkResponse({type:ProductEntity}) @ApiDomainNotFound('PRODUCT_NOT_FOUND','Product was not found') @Patch(':id') update(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: UpdateProductDto) { return this.service.update(id, user.organizationId, dto); }
  @ApiOperation({summary:'Archive a product'}) @ApiOkResponse({type:ProductEntity}) @ApiDomainNotFound('PRODUCT_NOT_FOUND','Product was not found') @Patch(':id/archive') archive(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.service.archive(id, user.organizationId); }
  @ApiOperation({summary:'Restore an archived product'}) @ApiOkResponse({type:ProductEntity}) @ApiDomainNotFound('PRODUCT_NOT_FOUND','Product was not found') @Post(':id/restore') restore(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.service.restore(id, user.organizationId); }
  @ApiOperation({summary:'Resubmit a rejected product for review'}) @ApiOkResponse({type:ProductEntity}) @ApiDomainNotFound('PRODUCT_NOT_FOUND','Product was not found') @ApiDomainConflict('PRODUCT_STATE_INVALID','Product cannot be resubmitted in its current state') @Post(':id/resubmit') resubmit(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: UpdateProductDto) { return this.service.resubmit(id, user.organizationId, dto); }
  @ApiOperation({summary:'Delete a product'}) @ApiOkResponse({schema:{type:'object',properties:{deleted:{type:'boolean',example:true}}}}) @ApiDomainNotFound('PRODUCT_NOT_FOUND','Product was not found') @Delete(':id') remove(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.service.delete(id, user.organizationId); }
}
