import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '../auth/authorization';
import { CurrentUser, RequestContext } from '../common/request-context';
import { ActivateEmailTemplateDto, CreateEmailTemplateDto, EmailTemplateQueryDto, PreviewEmailTemplateDto, UpdateEmailTemplateDto } from './email-template.dto';
import { EmailTemplateService } from './email-template.service';

@ApiBearerAuth() @ApiTags('platform-email-templates') @Roles(UserRole.SuperAdmin) @Controller('platform/email-templates')
export class EmailTemplateController{
  constructor(private readonly service:EmailTemplateService){}
  @Get() list(@Query()q:EmailTemplateQueryDto){return this.service.list(q);}
  @Post() create(@CurrentUser()u:RequestContext,@Body()dto:CreateEmailTemplateDto){return this.service.create(u,dto);}
  @Get(':id') get(@Param('id')id:string){return this.service.get(id);}
  @Patch(':id') revise(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:UpdateEmailTemplateDto){return this.service.revise(u,id,dto);}
  @Post(':id/activate') activate(@CurrentUser()u:RequestContext,@Param('id')id:string,@Body()dto:ActivateEmailTemplateDto){return this.service.activate(u,id,dto);}
  @Post(':id/preview') preview(@Param('id')id:string,@Body()dto:PreviewEmailTemplateDto){return this.service.preview(id,dto);}
  @Get(':id/history') history(@Param('id')id:string){return this.service.historyList(id);}
}
