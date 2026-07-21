import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
export enum SortDirection { Asc = 'asc', Desc = 'desc' }
export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsString() @MaxLength(50) sortBy = 'createdAt';
  @IsOptional() @IsEnum(SortDirection) sortDirection = SortDirection.Desc;
}
export const toOrder = <T extends string>(requested: string, direction: SortDirection, allowed: readonly T[], fallback: T): Record<string, 'ASC' | 'DESC'> => {
  const field = allowed.includes(requested as T) ? requested : fallback;
  return { [field]: direction === SortDirection.Asc ? 'ASC' : 'DESC', id: direction === SortDirection.Asc ? 'ASC' : 'DESC' };
};
