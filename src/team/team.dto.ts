import { IsEmail, IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator'; import { PageQueryDto } from '../common/page-query.dto'; export enum TeamRole { Admin='admin', Staff='staff' } export enum TeamStatus { Active='active', Pending='pending', Inactive='inactive' }
export class InviteMemberDto { @IsString() firstName!: string; @IsString() lastName!: string; @IsEmail() email!: string; @IsEnum(TeamRole) role!: TeamRole; }
export class UpdateMemberDto { @IsString() @Length(2, 100) firstName!: string; @IsString() @Length(2, 100) lastName!: string; @IsEnum(TeamRole) role!: TeamRole; }
export class TeamQueryDto extends PageQueryDto { @IsOptional() @IsEnum(TeamRole) role?: TeamRole; @IsOptional() @IsEnum(TeamStatus) status?: TeamStatus; @IsIn(['firstName','lastName','email','role','status','createdAt','updatedAt']) override sortBy='createdAt'; }
export class AcceptInvitationDto { @IsString() token!:string; @IsString() @Length(10,128) password!:string; }
