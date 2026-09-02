import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '../auth/authorization';
import { PlatformDashboardService } from './platform-dashboard.service';

@ApiTags('platform-dashboard')
@ApiBearerAuth()
@Roles(UserRole.SuperAdmin)
@Controller('platform/dashboard')
export class PlatformDashboardController {
  constructor(private readonly service: PlatformDashboardService) {}

  @Get('overview')
  overview() {
    return this.service.overview();
  }
}
