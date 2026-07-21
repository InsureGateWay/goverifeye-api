import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { IsIn } from 'class-validator'; import { PageQueryDto } from '../../common/page-query.dto';
export class RequestOtpDto { @IsEmail() email!: string; }
export class VerifyOtpDto { @IsEmail() email!: string; @Matches(/^\d{6}$/) code!: string; }
export class RegisterDto { @IsString() registrationToken!:string; @IsString() @Length(10, 128) password!: string; }
export class LoginDto { @IsEmail() email!: string; @IsString() @Length(1, 128) password!: string; }
export class RefreshDto { @IsString() refreshToken!:string; }
export class SessionQueryDto extends PageQueryDto { @IsIn(['createdAt','updatedAt','expiresAt','revokedAt']) override sortBy='createdAt'; }
