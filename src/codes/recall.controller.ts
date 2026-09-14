import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '../auth/authorization';
import { CurrentUser, RequestContext } from '../common/request-context';
import { RecallDto, RecallQueryDto } from './code.dto';
import { CodesService } from './codes.service';

@ApiTags('recalls') @ApiBearerAuth() @Controller()
export class RecallController {
  constructor(private readonly codes:CodesService){}
  @Roles(UserRole.VendorAdmin) @Post('products/:id/recall') recallProduct(@CurrentUser()user:RequestContext,@Param('id')id:string,@Body()dto:RecallDto){return this.codes.recallProduct(user.organizationId,user.userId,id,dto.reason)}
  @Roles(UserRole.VendorAdmin) @Post('code-batches/:id/recall') recallBatch(@CurrentUser()user:RequestContext,@Param('id')id:string,@Body()dto:RecallDto){return this.codes.recallBatch(user.organizationId,user.userId,id,dto.reason)}
  @Roles(UserRole.VendorAdmin,UserRole.VendorStaff) @Get('recalls') history(@CurrentUser()user:RequestContext,@Query()query:RecallQueryDto){return this.codes.listRecalls(user.organizationId,query)}
}
