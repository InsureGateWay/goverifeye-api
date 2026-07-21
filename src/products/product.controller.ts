import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestContext } from '../common/request-context';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';
import { ProductService } from './product.service';
@ApiTags('products') @ApiBearerAuth() @Controller('products')
export class ProductController {
  constructor(private readonly service: ProductService) {}
  @Get() list(@CurrentUser() user: RequestContext, @Query() query: ProductQueryDto) { return this.service.list(user.organizationId, query); }
  @Post() create(@CurrentUser() user: RequestContext, @Body() dto: CreateProductDto) { return this.service.create(user.organizationId, user.userId, dto); }
  @Get(':id') get(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.service.get(id, user.organizationId); }
  @Patch(':id') update(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: UpdateProductDto) { return this.service.update(id, user.organizationId, dto); }
  @Patch(':id/archive') archive(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.service.archive(id, user.organizationId); }
  @Post(':id/restore') restore(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.service.restore(id, user.organizationId); }
  @Post(':id/resubmit') resubmit(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: UpdateProductDto) { return this.service.resubmit(id, user.organizationId, dto); }
  @Delete(':id') remove(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.service.delete(id, user.organizationId); }
}
