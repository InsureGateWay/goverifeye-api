import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'; import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'; import { CurrentUser, RequestContext } from '../common/request-context'; import { Roles, UserRole } from '../auth/authorization';
import { AuditQueryDto, AuditSummaryQueryDto, ChangePasswordDto, CreateProfileImageUploadDto, NotificationQueryDto, UpdateCompanyDto, UpdateProfileDto } from './operations.dto'; import { OperationsService } from './operations.service';
import { ProfileImageStorageService } from './profile-image-storage.service';
@ApiBearerAuth() @ApiTags('operations') @Controller() export class OperationsController { constructor(private readonly service:OperationsService,private readonly profileImages:ProfileImageStorageService){}
 @Roles(UserRole.Admin) @Get('audit-logs') audit(@CurrentUser()u:RequestContext,@Query()q:AuditQueryDto){return this.service.listAudit(u.organizationId,q)}
 @Roles(UserRole.Admin) @Get('audit-log-summary') auditSummary(@CurrentUser()u:RequestContext,@Query()q:AuditSummaryQueryDto){return this.service.auditSummary(u.organizationId,q)}
 @Get('notifications') notifications(@CurrentUser()u:RequestContext,@Query()q:NotificationQueryDto){return this.service.listNotifications(u.organizationId,u.userId,q)}
 @Get('notifications/unread-count') async unread(@CurrentUser()u:RequestContext){const page=await this.service.listNotifications(u.organizationId,u.userId,Object.assign(new NotificationQueryDto(),{read:false,page:1,pageSize:1}));return{unreadCount:page.meta.total}}
 @Post('notifications/:id/read') read(@CurrentUser()u:RequestContext,@Param('id')id:string){return this.service.markRead(u.organizationId,u.userId,id)}
 @Post('notifications/read-all') readAll(@CurrentUser()u:RequestContext){return this.service.readAll(u.organizationId,u.userId)}
 @Delete('notifications/:id') remove(@CurrentUser()u:RequestContext,@Param('id')id:string){return this.service.deleteNotification(u.organizationId,u.userId,id)}
 @Get('settings/profile') profile(@CurrentUser()u:RequestContext){return this.service.profile(u.organizationId,u.userId)}
 @Patch('settings/profile') updateProfile(@CurrentUser()u:RequestContext,@Body()dto:UpdateProfileDto){return this.service.updateProfile(u.organizationId,u.userId,dto)}
 @Post('settings/profile/image-upload') profileImageUpload(@CurrentUser()u:RequestContext,@Body()dto:CreateProfileImageUploadDto){return this.profileImages.createUpload(u.organizationId,u.userId,dto.fileName)}
 @Get('settings/company') company(@CurrentUser()u:RequestContext){return this.service.company(u.organizationId)}
 @Roles(UserRole.Admin) @Patch('settings/company') updateCompany(@CurrentUser()u:RequestContext,@Body()dto:UpdateCompanyDto){return this.service.updateCompany(u.organizationId,dto)}
 @Post('settings/password/change') password(@CurrentUser()u:RequestContext,@Body()dto:ChangePasswordDto){return this.service.changePassword(u.organizationId,u.userId,dto)}
 @Post('settings/account/deactivate') deactivate(@CurrentUser()u:RequestContext){return this.service.deactivate(u.organizationId,u.userId)}
}
