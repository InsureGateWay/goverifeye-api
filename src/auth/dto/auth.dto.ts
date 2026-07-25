import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { IsIn } from 'class-validator'; import { PageQueryDto } from '../../common/page-query.dto';
export class RequestOtpDto { @IsEmail() email!: string; }
export class VerifyOtpDto { @IsEmail() email!: string; @Matches(/^\d{6}$/) code!: string; }
export class RegisterDto { @IsString() registrationToken!:string; @IsString() @Length(10, 128) password!: string; }
export class LoginDto { @IsEmail() email!: string; @IsString() @Length(1, 128) password!: string; }
export class RefreshDto { @IsString() refreshToken!:string; }
export class SessionQueryDto extends PageQueryDto { @IsIn(['createdAt','updatedAt','expiresAt','revokedAt']) override sortBy='createdAt'; }
export class OtpChallengeResponseDto { challengeId!: string; expiresInSeconds!: number; }
export class OtpVerifiedResponseDto { verified!: boolean; registrationToken!: string; expiresInSeconds!: number; }
export class TokenResponseDto { accessToken!: string; refreshToken!: string; tokenType!: string; expiresInSeconds!: number; }
export class ActionResponseDto { loggedOut?: boolean; revoked?: boolean; }
export class CurrentUserResponseDto { id!: string; email!: string; firstName!: string; lastName!: string; phone?: string; organizationId!: string; role!: string; }
export class SessionResponseDto { id!: string; createdAt!: Date; updatedAt!: Date; expiresAt!: Date; revokedAt?: Date; current!: boolean; }
