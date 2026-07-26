import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/auth.entity';
import { OperationsModule } from '../operations/operations.module';
import { PublicInvitationController, TeamController } from './team.controller';
import { TeamInvitationEntity, TeamMemberEntity } from './team.entity';
import { InvitationDeliveryController } from './invitation-delivery.controller';
@Module({ imports:[TypeOrmModule.forFeature([TeamMemberEntity,TeamInvitationEntity,UserEntity]),OperationsModule],controllers:[TeamController,PublicInvitationController,InvitationDeliveryController] })
export class TeamModule{}
