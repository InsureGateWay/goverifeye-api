import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsOptional() @IsInt() @Min(1) @Max(65535) PORT: number = 3001;
  @IsString() @IsNotEmpty() DATABASE_URL!: string;
  @IsString() @IsNotEmpty() JWT_ACCESS_SECRET!: string;
  @IsString() @IsNotEmpty() JWT_REFRESH_SECRET!: string;
  @IsString() @IsNotEmpty() CODE_ACTIVATION_PEPPER!: string;
  @IsString() @MinLength(32) GVE_CODE_MASTER_KEY!: string;
  @IsString() @IsNotEmpty() GVE_CODE_KEY_VERSION!: string;
}
export function validateEnvironment(input: Record<string, unknown>) {
  const normalized = { ...input, ...(input.PORT === undefined || input.PORT === '' ? {} : { PORT: Number(input.PORT) }) };
  const config = plainToInstance(EnvironmentVariables, normalized);
  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length) throw new Error(errors.toString());
  return config;
}
