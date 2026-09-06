import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RevealBatchPinDto {
  @ApiProperty({ description: 'Current account password, checked again independently of the active session.' })
  @IsString() @Length(6, 128) password!: string;
  @ApiProperty({ description: 'Reason for first reveal or PIN replacement.', maxLength: 200 })
  @IsString() @Length(3, 200) reason!: string;
}

export class ActivateCodeBatchDto {
  @ApiProperty({ example: true, description: 'Explicit confirmation to activate this entire allocation.' })
  @Equals(true) confirm!: boolean;
  @ApiProperty({ example: 'LOT-2026-0906', description: 'Manufacturer production lot reference.' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 100) productBatchReference!: string;
  @ApiPropertyOptional({ description: 'Required for controlled physical batches; current account password.' })
  @IsOptional() @IsString() @Length(6, 128) password?: string;
  @ApiPropertyOptional({ example: '4837 2051', description: 'Eight-digit PIN, required for controlled physical batches.' })
  @Transform(({ value }) => typeof value === 'string' ? value.replace(/[\s-]/g, '') : value)
  @IsOptional() @Matches(/^[0-9]{8}$/) pin?: string;
}
