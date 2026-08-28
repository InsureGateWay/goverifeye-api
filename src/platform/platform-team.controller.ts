import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, UserRole } from '../auth/authorization';
import { CurrentUser, RequestContext } from '../common/request-context';
import { InviteMemberDto, TeamQueryDto, UpdateMemberDto } from '../team/team.dto';
import { PlatformTeamService } from './platform-team.service';

@ApiTags('platform-team')
@ApiBearerAuth()
@Roles(UserRole.PlatformAdmin)
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

  @Post('invites')
  invite(@CurrentUser() user: RequestContext, @Body() dto: InviteMemberDto) {
    return this.service.invite(user.userId, dto);
  }

  @Patch('members/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    const orgId = await this.service.resolvePlatformOrganizationId();
    return this.service.update(orgId, id, dto);
  }

  @Post('members/:id/deactivate')
  async deactivate(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
  ) {
    const orgId = await this.service.resolvePlatformOrganizationId();
    return this.service.deactivate(orgId, user.userId, id);
  }
}
