import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles, UserRole } from '../auth/authorization';
import { CurrentUser, RequestContext } from '../common/request-context';
import {
  AddCaseNoteDto, AuditExceptionQueryDto, CreateAuditExceptionDto,
  CreateChangeRequestDto, CreateFraudCaseDto, CreateIncidentDto,
  ExportQueryDto, FraudCaseQueryDto, InviteVendorDto, MfaCodeDto,
  MfaDisableDto, PlatformProductQueryDto, PlatformProductStatusDto,
  ResolveAuditExceptionDto, UpdateFraudCaseDto, UpdateIncidentDto,
  VendorLifecycleDto, ReviewChangeRequestDto, ChangeRequestQueryDto, OptionQueryDto, CreateOptionDto, UpdateOptionDto,
} from './governance.dto';
import { GovernanceService, UploadedVendorFile } from './governance.service';
import { Public } from '../auth/public.decorator';
import { CreateProductDto } from '../products/dto/product.dto';

@ApiBearerAuth() @ApiTags('governance') @Controller()
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}

  @Public() @Get('options') options(){return this.service.publicOptions();}
  @Public() @Get('options/:namespace') optionsByNamespace(@Param('namespace')namespace:string){return this.service.publicOptions(namespace);}
  @Roles(UserRole.SuperAdmin) @Get('platform/options/all') allOptions(){return this.service.allOptions();}
  @Roles(UserRole.SuperAdmin) @Get('platform/options') adminOptions(@Query()q:OptionQueryDto){return this.service.listOptions(q);}
  @Roles(UserRole.SuperAdmin) @Post('platform/options') createOption(@CurrentUser()u:RequestContext,@Body()dto:CreateOptionDto){return this.service.createOption(u,dto);}
  @Roles(UserRole.SuperAdmin) @Patch('platform/options/:id') updateOption(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:UpdateOptionDto){return this.service.updateOption(u,id,dto);}
  @Roles(UserRole.SuperAdmin) @Get('platform/options/:id/history') optionHistory(@Param('id')id:string){return this.service.optionHistoryList(id);}

  @Post('settings/change-requests') createChange(@CurrentUser()u:RequestContext,@Body()dto:CreateChangeRequestDto){return this.service.createChangeRequest(u,dto);}
  @Post('settings/2fa/enroll') enrollMfa(@CurrentUser()u:RequestContext){return this.service.beginMfa(u);}
  @Post('settings/2fa/verify') verifyMfa(@CurrentUser()u:RequestContext,@Body()dto:MfaCodeDto){return this.service.verifyMfa(u,dto.code);}
  @Post('settings/2fa/disable') disableMfa(@CurrentUser()u:RequestContext,@Body()dto:MfaDisableDto){return this.service.disableMfa(u,dto.code,dto.password);}
  @Roles(UserRole.SuperAdmin) @Get('platform/change-requests') changeRequests(@Query()q:ChangeRequestQueryDto){return this.service.listChangeRequests(q);}
  @Roles(UserRole.SuperAdmin) @Patch('platform/change-requests/:id') reviewChange(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:ReviewChangeRequestDto){return this.service.reviewChangeRequest(u,id,dto.status,dto.notes);}

  @Roles(UserRole.SuperAdmin) @Get('platform/products/metrics') productMetrics(){return this.service.productMetrics();}
  @Roles(UserRole.SuperAdmin) @Get('platform/products') products(@Query()q:PlatformProductQueryDto){return this.service.listProducts(q);}
  @Roles(UserRole.SuperAdmin) @Get('platform/products/export') @Header('Content-Type','text/csv; charset=utf-8') async productExport(@Query()q:ExportQueryDto,@Res()res:Response){res.attachment('platform-products.csv').send(await this.service.productsCsv(q.limit));}
  @Roles(UserRole.SuperAdmin) @Get('platform/products/:id/approval-request') async productRequest(@Param('id')id:string){return {item:await this.service.product(id)};}
  @Roles(UserRole.SuperAdmin) @Get('platform/products/:id') product(@Param('id')id:string){return this.service.product(id);}
  @Roles(UserRole.SuperAdmin) @Patch('platform/products/:id/status') productStatus(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:PlatformProductStatusDto){return this.service.setProductStatus(u,id,dto.status,dto.reason);}
  @Roles(UserRole.SuperAdmin) @Patch('platform/products/:id/archive') archiveProduct(@CurrentUser()u:RequestContext,@Param('id')id:string){return this.service.setProductStatus(u,id,'archived');}
  @Roles(UserRole.SuperAdmin) @Post('platform/vendors/:vendorId/products') createProductForVendor(@CurrentUser()u:RequestContext,@Param('vendorId')vendorId:string,@Body()dto:CreateProductDto){return this.service.createProductForVendor(u,vendorId,dto);}

  @Roles(UserRole.SuperAdmin) @Post('platform/vendors/invites') @UseInterceptors(FileFieldsInterceptor([{name:'cac',maxCount:1},{name:'tax',maxCount:1},{name:'other',maxCount:1}],{limits:{fileSize:5*1024*1024,files:3}})) inviteVendor(@CurrentUser()u:RequestContext,@Body()dto:InviteVendorDto,@UploadedFiles()files?:Record<string,UploadedVendorFile[]>){return this.service.inviteVendor(u,dto,files);}
  @Roles(UserRole.SuperAdmin) @Post('platform/vendors/:id/deactivate') deactivateVendor(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:VendorLifecycleDto){return this.service.vendorLifecycle(u,id,'deactivated',dto);}
  @Roles(UserRole.SuperAdmin) @Post('platform/vendors/:id/reactivate') reactivateVendor(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:VendorLifecycleDto){return this.service.vendorLifecycle(u,id,'approved',dto);}

  @Roles(UserRole.SuperAdmin) @Get('platform/fraud-alerts/overview') fraudOverview(){return this.service.fraudOverview();}
  @Roles(UserRole.SuperAdmin) @Get('platform/fraud-alerts') fraud(@Query()q:FraudCaseQueryDto){return this.service.listFraud(q);}
  @Roles(UserRole.SuperAdmin) @Post('platform/fraud-alerts') createFraud(@CurrentUser()u:RequestContext,@Body()dto:CreateFraudCaseDto){return this.service.createFraud(u,dto);}
  @Roles(UserRole.SuperAdmin) @Patch('platform/fraud-alerts/:id') updateFraud(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:UpdateFraudCaseDto){return this.service.updateFraud(u,id,dto);}
  @Roles(UserRole.SuperAdmin) @Post('platform/fraud-alerts/:id/notes') fraudNote(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:AddCaseNoteDto){return this.service.addFraudNote(u,id,dto);}

  @Roles(UserRole.SuperAdmin) @Get('platform/audit-exceptions') exceptions(@Query()q:AuditExceptionQueryDto){return this.service.listExceptions(q);}
  @Roles(UserRole.SuperAdmin) @Post('platform/audit-exceptions') createException(@CurrentUser()u:RequestContext,@Body()dto:CreateAuditExceptionDto){return this.service.createException(u,dto);}
  @Roles(UserRole.SuperAdmin) @Post('platform/audit-exceptions/:id/close') closeException(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:ResolveAuditExceptionDto){return this.service.resolveException(u,id,dto);}
  @Roles(UserRole.SuperAdmin) @Get('platform/audit-logs/export') @Header('Content-Type','text/csv; charset=utf-8') async platformAuditExport(@Query()q:ExportQueryDto,@Res()res:Response){res.attachment('platform-audit.csv').send(await this.service.auditCsv(q.limit,true));}
  @Roles(UserRole.Admin) @Get('audit-logs/export') @Header('Content-Type','text/csv; charset=utf-8') async vendorAuditExport(@Query()q:ExportQueryDto,@Res()res:Response){res.attachment('audit.csv').send(await this.service.auditCsv(q.limit));}

  @Roles(UserRole.SuperAdmin) @Get('platform/system-health/overview') health(){return this.service.systemHealth();}
  @Roles(UserRole.SuperAdmin) @Post('platform/system-health/incidents') createIncident(@CurrentUser()u:RequestContext,@Body()dto:CreateIncidentDto){return this.service.createIncident(u,dto);}
  @Roles(UserRole.SuperAdmin) @Patch('platform/system-health/incidents/:id') updateIncident(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:UpdateIncidentDto){return this.service.updateIncident(u,id,dto);}
}
