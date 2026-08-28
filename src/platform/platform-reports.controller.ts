import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '../auth/authorization';
import { PlatformReportsService } from './platform-reports.service';

@ApiTags('platform-reports')
@ApiBearerAuth()
@Roles(UserRole.PlatformAdmin)
@Controller('platform/reports')
export class PlatformReportsController {
  constructor(private readonly service: PlatformReportsService) {}

  @Get('overview')
  overview() {
    return this.service.overview();
  }
}
