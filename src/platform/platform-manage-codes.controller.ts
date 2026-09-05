import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles, UserRole } from '../auth/authorization';
import { CodeQueryDto } from '../codes/code.dto';
import { PlatformManageCodesService } from './platform-manage-codes.service';
import { CurrentUser, RequestContext } from '../common/request-context';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

class ActivateBatchDto {
  @ApiProperty({example:'12345678',description:'One-time batch/allocation activation credential.'})
  @IsString()
  @Matches(/^\d{6,16}$/)
  credential!:string;
}

@ApiTags('platform-manage-codes')
@ApiBearerAuth()
@Roles(UserRole.SuperAdmin)
@Controller('platform/manage-codes')
export class PlatformManageCodesController {
  constructor(private readonly service: PlatformManageCodesService) {}

  @Get('metrics')
  getMetrics() {
    return this.service.getMetrics();
  }

  @Get('batches')
  listBatches() {
    return this.service.listBatches();
  }

  @Get('batches/:id')
  getBatch(@Param('id') id: string) {
    return this.service.getBatch(id);
  }

  @Get('batches/:id/codes')
  listCodes(@Param('id') id: string, @Query() query: CodeQueryDto) {
    return this.service.listCodes(id, query);
  }

  @Get('batches/:id/export')
  async exportBatch(@Param('id') id: string, @Res() res: Response) {
    const { csv, filename } = await this.service.exportBatchCsv(id);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(csv);
  }

  @Post('batches/:id/activate')
  activateBatch(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto:ActivateBatchDto) {
    return this.service.activateBatch(id, user, dto.credential);
  }
}
