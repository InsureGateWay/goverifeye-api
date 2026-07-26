import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Roles, UserRole } from '../auth/authorization';
import { DomainError } from '../common/domain-error';
import { CurrentUser, RequestContext } from '../common/request-context';
import { OutboxMessageEntity } from '../operations/operations.entity';
import { TeamInvitationEntity } from './team.entity';

@ApiTags('team') @ApiBearerAuth() @Roles(UserRole.Admin) @Controller('team/invitations')
export class InvitationDeliveryController {
  constructor(private readonly dataSource:DataSource){}
  @Get(':id/delivery')
  @ApiOkResponse({schema:{example:{invitationId:'uuid',deliveryStatus:'sent',attempts:1,deliveredAt:'2026-07-26T12:00:00.000Z'}}})
  async status(@CurrentUser()user:RequestContext,@Param('id')id:string){
    const invitation=await this.dataSource.getRepository(TeamInvitationEntity).findOneBy({id,organizationId:user.organizationId});
    if(!invitation)throw new DomainError('Invitation was not found','INVITATION_NOT_FOUND',404);
    const outbox=await this.dataSource.getRepository(OutboxMessageEntity).findOne({where:{aggregateType:'invitation',aggregateId:id},order:{createdAt:'DESC'}});
    return{invitationId:id,deliveryStatus:outbox?.status==='processed'?'sent':outbox?.status==='dead_letter'?'failed':'queued',attempts:outbox?.attempts??0,deliveredAt:outbox?.processedAt};
  }
}
