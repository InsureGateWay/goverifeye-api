import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlatformGenerateBatchDto {
  @ApiProperty({ example: ['micro', 'main'], isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['micro', 'main'], { each: true })
  labels!: Array<'micro' | 'main'>;

  @ApiProperty({ minimum: 100, maximum: 10000, example: 5000 })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(10000)
  quantity!: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vendorId!: string;

  @ApiPropertyOptional({ example: 'Oge Thrills' })
  @IsOptional()
  @IsString()
  vendorName?: string;

  @ApiPropertyOptional({ example: 14.25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  unitPrice?: number;

  @ApiPropertyOptional({ example: 71250 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedCost?: number;
}
