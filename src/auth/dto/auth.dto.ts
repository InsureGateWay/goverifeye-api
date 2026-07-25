import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { IsIn } from 'class-validator'; import { PageQueryDto } from '../../common/page-query.dto';
import { ApiProperty } from '@nestjs/swagger';
export class RequestOtpDto {
  @ApiProperty({ description: 'Email address that will receive the six-digit verification code', example: 'tester@example.com', format: 'email' })
  @IsEmail()
  email!: string;
}
export class VerifyOtpDto {
  @ApiProperty({ description: 'The same email address used when requesting the code', example: 'tester@example.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Six-digit verification code received by email', example: '123456', pattern: '^\\d{6}$', minLength: 6, maxLength: 6 })
  @Matches(/^\d{6}$/)
  code!: string;
}
export class RegisterDto {
  @ApiProperty({ description: 'Short-lived registration proof returned by the OTP verification endpoint', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  registrationToken!:string;

  @ApiProperty({ description: 'Account password; must contain between 10 and 128 characters', example: 'SecurePass123!', minLength: 10, maxLength: 128 })
  @IsString()
  @Length(10, 128)
  password!: string;
}
export class LoginDto {
  @ApiProperty({ example: 'tester@example.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 1, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  password!: string;
}
export class RefreshDto {
  @ApiProperty({ description: 'Refresh token returned by registration, login, or a previous refresh', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  refreshToken!:string;
}
export class SessionQueryDto extends PageQueryDto { @IsIn(['createdAt','updatedAt','expiresAt','revokedAt']) override sortBy='createdAt'; }
export class OtpChallengeResponseDto {
  @ApiProperty({ format: 'uuid', example: 'f17fdb48-05ec-44bf-b882-d480c90e0c91' }) challengeId!: string;
  @ApiProperty({ example: 600 }) expiresInSeconds!: number;
}
export class OtpVerifiedResponseDto {
  @ApiProperty({ example: true }) verified!: boolean;
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }) registrationToken!: string;
  @ApiProperty({ example: 600 }) expiresInSeconds!: number;
}
export class TokenResponseDto { accessToken!: string; refreshToken!: string; tokenType!: string; expiresInSeconds!: number; }
export class ActionResponseDto { loggedOut?: boolean; revoked?: boolean; }
export class CurrentUserResponseDto { id!: string; email!: string; firstName!: string; lastName!: string; phone?: string; organizationId!: string; role!: string; }
export class SessionResponseDto { id!: string; createdAt!: Date; updatedAt!: Date; expiresAt!: Date; revokedAt?: Date; current!: boolean; }
