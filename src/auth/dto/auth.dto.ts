import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { IsIn } from 'class-validator'; import { PageQueryDto } from '../../common/page-query.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class RequestOtpDto {
  @ApiProperty({ description: 'Email address that will receive the six-digit verification code', example: 'tester@example.com', format: 'email' })
  @IsEmail()
  email!: string;
}
export class VerifyOtpDto {
  @ApiProperty({ description: 'Opaque challenge identifier returned by the OTP request endpoint', example: 'f17fdb48-05ec-44bf-b882-d480c90e0c91', format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ description: 'Six-digit verification code received by email', example: '123456', pattern: '^\\d{6}$', minLength: 6, maxLength: 6 })
  @Matches(/^\d{6}$/)
  code!: string;
}
export class RegisterDto {
  @ApiProperty({ description: 'Short-lived registration proof returned by the OTP verification endpoint', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  registrationToken!:string;

  @ApiProperty({ description: 'Account password; must contain between 6 and 128 characters', example: 'SecurePass123!', minLength: 6, maxLength: 128 })
  @IsString()
  @Length(6, 128)
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

  @ApiPropertyOptional({ description: 'Keep the browser session available after the browser closes', example: true, default: false })
  @IsOptional()
  @IsBoolean()
  rememberMe = false;
}
export class RefreshDto {
  @ApiPropertyOptional({ description: 'Refresh token for non-browser clients. Browsers may use the secure refresh cookie.', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsOptional()
  @IsString()
  refreshToken?:string;
}
export class ForgotPasswordDto {
  @ApiProperty({description:'Account email address. The response is identical whether or not an account exists.',example:'tester@example.com',format:'email'})
  @IsEmail()
  email!:string;
}
export class ResetPasswordDto {
  @ApiProperty({description:'Account email address used to request the reset code',example:'tester@example.com',format:'email'})
  @IsEmail()
  email!:string;
  @ApiProperty({description:'Six-digit password-reset code received by email',example:'482193',pattern:'^\\d{6}$'})
  @Matches(/^\d{6}$/)
  code!:string;
  @ApiProperty({description:'New account password',example:'NewSecurePass123!',minLength:6,maxLength:128})
  @IsString()
  @Length(6,128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,{message:'password must include uppercase, lowercase, and a number'})
  password!:string;
}
export class ForgotPasswordResponseDto {
  @ApiProperty({example:'If an account exists for that email, a password reset link has been sent.'})
  message!:string;
  @ApiProperty({example:600}) expiresInSeconds!:number;
}
export class ResetPasswordResponseDto {
  @ApiProperty({example:true}) passwordReset!:boolean;
}
export class SessionQueryDto extends PageQueryDto { @IsIn(['createdAt','updatedAt','expiresAt','revokedAt']) override sortBy='createdAt'; }
export class OtpChallengeResponseDto {
  @ApiProperty({ format: 'uuid', example: 'f17fdb48-05ec-44bf-b882-d480c90e0c91' }) challengeId!: string;
  @ApiProperty({ example: 600 }) expiresInSeconds!: number;
  @ApiProperty({ example: 'If this email is eligible for registration, a verification code will be sent.' }) message!: string;
}
export class OtpVerifiedResponseDto {
  @ApiProperty({ example: true }) verified!: boolean;
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }) registrationToken!: string;
  @ApiProperty({ example: 600 }) expiresInSeconds!: number;
}
export class TokenResponseDto { accessToken!: string; refreshToken!: string; tokenType!: string; expiresInSeconds!: number; }
export class VerifyLoginMfaDto { @IsUUID() challengeId!:string; @Matches(/^\d{6}$/) code!:string; @IsOptional() @IsEmail() email?:string; }
export class ActionResponseDto { loggedOut?: boolean; revoked?: boolean; }
export class CurrentUserResponseDto { id!: string; email!: string; firstName!: string; lastName!: string; phone?: string; organizationId!: string; role!: string; }
export class SessionResponseDto { id!: string; createdAt!: Date; updatedAt!: Date; expiresAt!: Date; revokedAt?: Date; current!: boolean; }
