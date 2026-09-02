import { Controller, Get, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '../auth/authorization';
import { PlatformReportsService } from './platform-reports.service';
import type { Response } from 'express';

@ApiTags('platform-reports')
@ApiBearerAuth()
@Roles(UserRole.SuperAdmin)
@Controller('platform/reports')
export class PlatformReportsController {
  constructor(private readonly service: PlatformReportsService) {}

  @Get('overview')
  overview() {
    return this.service.overview();
  }

  @Get('trend')
  trend() {
    return this.service.trend();
  }

  @Get('export')
  async export(@Res() res: Response) {
    res.attachment('platform-report.csv').type('text/csv').send(await this.service.exportCsv());
  }
}
