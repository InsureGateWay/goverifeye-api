import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { CurrentUser, RequestContext } from '../common/request-context';
import { ActivateCodeDto, BatchQueryDto, CodeQueryDto, GenerateBatchDto, VerifyProductCodeDto } from './code.dto'; import { Query } from '@nestjs/common';
import { CodesService } from './codes.service';
import { Throttle } from '@nestjs/throttler';

@ApiTags('code-batches') @ApiBearerAuth() @Controller('code-batches')
export class CodesController {
  constructor(private readonly codes: CodesService) {}
  @Post() generate(@CurrentUser() user: RequestContext, @Body() dto: GenerateBatchDto) { return this.codes.generateBatch(user.organizationId, user.userId, dto); }
  @Get() list(@CurrentUser() user: RequestContext, @Query() query: BatchQueryDto) { return this.codes.listBatches(user.organizationId, query); }
  @Get(':id') get(@CurrentUser() user: RequestContext, @Param('id') id: string) { return this.codes.getBatch(user.organizationId, id); }
  @Get(':id/codes') listCodes(@CurrentUser() user: RequestContext, @Param('id') id: string, @Query() query: CodeQueryDto) { return this.codes.listCodes(user.organizationId, id, query); }
  @Post(':id/cancel') cancel(@CurrentUser()user:RequestContext,@Param('id')id:string){return this.codes.cancelBatch(user.organizationId,id)}
  @Post('codes/:id/suspend') suspend(@CurrentUser()user:RequestContext,@Param('id')id:string){return this.codes.setCodeStatus(user.organizationId,id,'suspended')}
  @Post('codes/:id/reactivate') reactivate(@CurrentUser()user:RequestContext,@Param('id')id:string){return this.codes.setCodeStatus(user.organizationId,id,'active')}
  @Throttle({default:{limit:10,ttl:60000}}) @Post('codes/activate') @HttpCode(200) activate(@CurrentUser() user: RequestContext, @Body() dto: ActivateCodeDto) { return this.codes.activate(user.organizationId, user.userId, dto); }
  @Public() @Throttle({default:{limit:30,ttl:60000}}) @Post('codes/verify') @HttpCode(200) verify(@Body() dto: VerifyProductCodeDto) { return this.codes.verify(dto.verificationCode); }
}
