import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '../auth/authorization';
import { CurrentUser, RequestContext } from '../common/request-context';
import { InviteMemberDto, TeamQueryDto, UpdateMemberDto } from '../team/team.dto';
import { PlatformTeamService } from './platform-team.service';
import type { Response } from 'express';

@ApiTags('platform-team')
@ApiBearerAuth()
@Roles(UserRole.SuperAdmin)
@Controller('platform/team')
export class PlatformTeamController {
  constructor(private readonly service: PlatformTeamService) {}

  @Get('metrics')
  metrics() {
    return this.service.metrics();
  }

  @Get('members')
  list(@Query() query: TeamQueryDto) {
    return this.service.list(query);
  }

  @Get('members/export')
  async export(@Res() res: Response) {
    res.attachment('platform-team-members.csv').type('text/csv').send(await this.service.exportCsv());
  }

  @Post('invites')
  invite(@CurrentUser() user: RequestContext, @Body() dto: InviteMemberDto) {
    return this.service.invite(user.userId, dto);
  }

  @Patch('members/:id')
  async update(
    @CurrentUser() user:RequestContext,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    const orgId = await this.service.resolvePlatformOrganizationId();
    return this.service.update(orgId, id, dto, user.role);
  }

  @Post('members/:id/deactivate')
  async deactivate(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
  ) {
    const orgId = await this.service.resolvePlatformOrganizationId();
    return this.service.deactivate(orgId, user.userId, id, user.role);
  }
}
