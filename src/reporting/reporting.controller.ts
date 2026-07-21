import { Controller,Get,Param,Query } from '@nestjs/common'; import { ApiBearerAuth,ApiTags } from '@nestjs/swagger'; import { CurrentUser,RequestContext } from '../common/request-context'; import { ReportingQueryDto } from './reporting.dto'; import { ReportingService } from './reporting.service';
@ApiTags('reporting') @ApiBearerAuth() @Controller() export class ReportingController {constructor(private readonly service:ReportingService){}
 @Get('dashboard') dashboard(@CurrentUser()u:RequestContext,@Query('range')range='weekly'){return this.service.summary(u.organizationId,range)}
 @Get('reports') reports(@CurrentUser()u:RequestContext,@Query('range')range='weekly'){return this.service.report(u.organizationId,range)}
 @Get('reports/top-products') top(@CurrentUser()u:RequestContext,@Query()q:ReportingQueryDto){return this.service.topProducts(u.organizationId,q)}
 @Get('reports/suspicious-scans') suspicious(@CurrentUser()u:RequestContext,@Query()q:ReportingQueryDto){return this.service.suspicious(u.organizationId,q)}
 @Get('reports/verification-events') events(@CurrentUser()u:RequestContext,@Query()q:ReportingQueryDto){return this.service.events(u.organizationId,q)}
 @Get('reports/locations') locations(@CurrentUser()u:RequestContext,@Query()q:ReportingQueryDto){return this.service.locations(u.organizationId,q)}
 @Get('dashboard/top-products') dashboardTop(@CurrentUser()u:RequestContext,@Query()q:ReportingQueryDto){return this.service.topProducts(u.organizationId,q)}
 @Get('dashboard/locations') dashboardLocations(@CurrentUser()u:RequestContext,@Query()q:ReportingQueryDto){return this.service.locations(u.organizationId,q)}
 @Get('dashboard/scan-events') dashboardEvents(@CurrentUser()u:RequestContext,@Query()q:ReportingQueryDto){return this.service.events(u.organizationId,q)}
 @Get('products/:id/verification-events') productEvents(@CurrentUser()u:RequestContext,@Param('id')id:string,@Query()q:ReportingQueryDto){q.productId=id;return this.service.events(u.organizationId,q)}
 @Get('products/:id/suspicious-scans') productSuspicious(@CurrentUser()u:RequestContext,@Param('id')id:string,@Query()q:ReportingQueryDto){q.productId=id;return this.service.suspicious(u.organizationId,q)}
 @Get('products/:id/activity') productActivity(@CurrentUser()u:RequestContext,@Param('id')id:string,@Query()q:ReportingQueryDto){return this.service.productActivity(u.organizationId,id,q)}
}
