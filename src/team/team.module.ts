import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/auth.entity';
import { OperationsModule } from '../operations/operations.module';
import { PublicInvitationController, TeamController } from './team.controller';
import { TeamInvitationEntity, TeamMemberEntity } from './team.entity';
@Module({ imports:[TypeOrmModule.forFeature([TeamMemberEntity,TeamInvitationEntity,UserEntity]),OperationsModule],controllers:[TeamController,PublicInvitationController] })
export class TeamModule{}
