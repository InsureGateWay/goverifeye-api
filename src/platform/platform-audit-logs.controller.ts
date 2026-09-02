import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '../auth/authorization';
import {
  AuditQueryDto,
  AuditSummaryQueryDto,
} from '../operations/operations.dto';
import { PlatformAuditLogsService } from './platform-audit-logs.service';

@ApiTags('platform-audit-logs')
@ApiBearerAuth()
@Roles(UserRole.SuperAdmin)
@Controller('platform/audit-logs')
export class PlatformAuditLogsController {
  constructor(private readonly service: PlatformAuditLogsService) {}

  @Get('summary')
  summary(@Query() query: AuditSummaryQueryDto) {
    return this.service.summary(query);
  }

  @Get()
  list(@Query() query: AuditQueryDto) {
    return this.service.list(query);
  }
}
