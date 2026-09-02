import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
export enum SortDirection { Asc = 'asc', Desc = 'desc' }
export class PageQueryDto {
  @ApiPropertyOptional({type:Number,minimum:1,default:1}) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({type:Number,minimum:1,maximum:100,default:20}) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @ApiPropertyOptional({type:String,maxLength:200}) @IsOptional() @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({type:String,default:'createdAt'}) @IsOptional() @IsString() @MaxLength(50) sortBy = 'createdAt';
  @ApiPropertyOptional({type:String,enum:SortDirection,default:SortDirection.Desc}) @IsOptional() @IsEnum(SortDirection) sortDirection = SortDirection.Desc;
}
export const toOrder = <T extends string>(requested: string, direction: SortDirection, allowed: readonly T[], fallback: T): Record<string, 'ASC' | 'DESC'> => {
  const field = allowed.includes(requested as T) ? requested : fallback;
  return { [field]: direction === SortDirection.Asc ? 'ASC' : 'DESC', id: direction === SortDirection.Asc ? 'ASC' : 'DESC' };
};
