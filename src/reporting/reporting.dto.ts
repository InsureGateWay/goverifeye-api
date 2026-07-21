import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PageQueryDto } from '../common/page-query.dto';
export class ReportingQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() range = 'weekly';
  @IsIn(['createdAt','name','scanned','suspicious','totalCodes','updatedAt','outcome','location','action','status']) override sortBy = 'createdAt';
}
