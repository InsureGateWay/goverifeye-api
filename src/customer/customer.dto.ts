import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { VerifyProductCodeDto } from '../codes/code.dto';
import type { CustomerCheckRequestDto, ConcernRequestDto, ShopperChallengeRequestDto, ShopperLoginRequestDto } from './customer.contract';

export class CustomerCheckBody extends VerifyProductCodeDto implements CustomerCheckRequestDto {
  @IsUUID() requestId!: string;
}
export class ShopperChallengeBody implements ShopperChallengeRequestDto { @IsEmail() @MaxLength(254) email!: string; }
export class ShopperLoginBody implements ShopperLoginRequestDto { @IsUUID() challengeId!: string; @Matches(/^\d{6}$/) code!: string; }
export class CustomerHistoryQuery { @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1; }
export class SharedCheckBody { @IsUUID() requestId!: string; }
export class ConcernBody implements ConcernRequestDto {
  @IsUUID() requestId!: string;
  @Matches(/^[a-f0-9]{64}$/) receipt!: string;
  @IsIn(['Product details do not match the item', 'Label looks damaged or reused', 'Seller concern', 'Product looks suspicious', 'Other']) reason!: string;
  @IsOptional() @IsString() @Length(1, 500) note?: string;
  @IsOptional() @IsString() @MaxLength(1400000) @Matches(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/) photo?: string;
}
