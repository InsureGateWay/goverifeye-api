import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { VerifyProductCodeDto } from '../codes/code.dto';
import type { CustomerCheckRequestDto, ConcernRequestDto, ShopperChallengeRequestDto, ShopperLoginRequestDto, ShopperPasswordLoginRequestDto, ShopperPasswordResetCompleteRequestDto, ShopperPasswordResetVerifyRequestDto, ShopperRegistrationCompleteRequestDto, ShopperRegistrationVerifyRequestDto } from './customer.contract';

export class CustomerCheckBody extends VerifyProductCodeDto implements CustomerCheckRequestDto {
  @IsUUID() requestId!: string;
}
export class ShopperChallengeBody implements ShopperChallengeRequestDto { @IsEmail() @MaxLength(254) email!: string; }
export class ShopperLoginBody implements ShopperLoginRequestDto { @IsUUID() challengeId!: string; @Matches(/^\d{6}$/) code!: string; }
export class ShopperRegistrationVerifyBody implements ShopperRegistrationVerifyRequestDto { @IsUUID() challengeId!: string; @Matches(/^\d{6}$/) code!: string; }
export class ShopperRegistrationCompleteBody implements ShopperRegistrationCompleteRequestDto {
  @Matches(/^[a-f0-9]{64}$/) registrationToken!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(2, 80) displayName!: string;
  @IsString() @Length(8, 72) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[\s\S]+$/, { message: 'password must contain uppercase, lowercase, and numeric characters' }) password!: string;
}
export class ShopperPasswordResetVerifyBody implements ShopperPasswordResetVerifyRequestDto { @IsUUID() challengeId!: string; @Matches(/^\d{6}$/) code!: string; }
export class ShopperPasswordResetCompleteBody implements ShopperPasswordResetCompleteRequestDto {
  @Matches(/^[a-f0-9]{64}$/) resetToken!: string;
  @IsString() @Length(8, 72) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[\s\S]+$/, { message: 'password must contain uppercase, lowercase, and numeric characters' }) password!: string;
}
export class ShopperPasswordLoginBody implements ShopperPasswordLoginRequestDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() @MaxLength(254) email!: string;
  @IsString() @Length(8, 72) password!: string;
}
export class CustomerHistoryQuery { @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1; }
export class SharedCheckBody { @IsUUID() requestId!: string; }
export class ConcernBody implements ConcernRequestDto {
  @IsUUID() requestId!: string;
  @Matches(/^[a-f0-9]{64}$/) receipt!: string;
  @IsIn(['Product details do not match the item', 'Label looks damaged or reused', 'Seller concern', 'Product looks suspicious', 'Other']) reason!: string;
  @IsOptional() @IsString() @Length(1, 500) note?: string;
  @IsOptional() @IsString() @MaxLength(1400000) @Matches(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/) photo?: string;
}
