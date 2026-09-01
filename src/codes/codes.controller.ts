import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res } from '@nestjs/common'; import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { CurrentUser, RequestContext } from '../common/request-context';
import { ActivateCodeDto, BatchQueryDto, CodeQueryDto, GenerateBatchDto, OpenMarketLinkDto, OpenMarketLookupDto, OpenMarketVerifyDto, VerifyProductCodeDto } from './code.dto'; import { Query } from '@nestjs/common';
import { CodesService } from './codes.service';
import { Throttle } from '@nestjs/throttler';
import { RequiresActivatedOrganization } from '../common/organization-activation.guard';

@ApiTags('code-batches') @ApiBearerAuth() @Controller('code-batches')
export class CodesController {
  constructor(private readonly codes: CodesService) {}
  @RequiresActivatedOrganization() @Post() generate(@CurrentUser() user: RequestContext,@Headers('idempotency-key')key:string|undefined,@Body() dto: GenerateBatchDto) { return this.codes.generateBatch(user.organizationId, user.userId, dto,key); }
  @Get() list(@CurrentUser() user: RequestContext, @Query() query: BatchQueryDto) { return this.codes.listBatches(user.organizationId, query); }
  @Get('summary') summary(@CurrentUser() user: RequestContext) { return this.codes.summary(user.organizationId); }
  @Get(':id/export') async export(@CurrentUser()user:RequestContext,@Param('id')id:string,@Res()res:Response){const result=await this.codes.exportCsv(user.organizationId,id);res.attachment(result.filename).type('text/csv').send(result.csv);}
  @Post('open-market/lookup') openMarketLookup(@CurrentUser()user:RequestContext,@Body()dto:OpenMarketLookupDto){return this.codes.openMarketLookup(user,dto)}
  @Post('open-market/:claimId/link') openMarketLink(@CurrentUser()user:RequestContext,@Param('claimId')claimId:string,@Body()dto:OpenMarketLinkDto){return this.codes.openMarketLink(user,claimId,dto)}
  @Post('open-market/:claimId/verify') openMarketVerify(@CurrentUser()user:RequestContext,@Param('claimId')claimId:string,@Body()dto:OpenMarketVerifyDto){return this.codes.openMarketVerify(user,claimId,dto)}
  @Get(':id') get(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.codes.getBatch(user.organizationId, id); }
  @Get(':id/codes') listCodes(@CurrentUser() user: RequestContext, @Param('id') id: string, @Query() query: CodeQueryDto) { return this.codes.listCodes(user.organizationId, id, query); }
  @Get('codes/:id/details') codeDetails(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.codes.getCodeDetails(user.organizationId, id); }
  @Post(':id/cancel') cancel(@CurrentUser()user:RequestContext,@Param('id')id:string){return this.codes.cancelBatch(user.organizationId,id)}
  @Post('codes/:id/suspend') suspend(@CurrentUser()user:RequestContext,@Param('id')id:string){return this.codes.setCodeStatus(user.organizationId,id,'suspended')}
  @Post('codes/:id/reactivate') reactivate(@CurrentUser()user:RequestContext,@Param('id')id:string){return this.codes.setCodeStatus(user.organizationId,id,'active')}
  @Throttle({default:{limit:10,ttl:60000}}) @Post('codes/activate') @HttpCode(200) activate(@CurrentUser() user: RequestContext, @Body() dto: ActivateCodeDto) { return this.codes.activate(user.organizationId, user.userId, dto); }
  @Public() @Throttle({default:{limit:30,ttl:60000}}) @Post('codes/verify') @HttpCode(200) verify(@Body() dto: VerifyProductCodeDto,@Req()request:Request) { return this.codes.verify(dto.verificationCode,{ip:request.ip,userAgent:request.get('user-agent'),location:dto.location,customerComplaint:dto.customerComplaint}); }
}
