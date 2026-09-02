import { registerAs } from '@nestjs/config';

export interface CodeGenerationOptions {
  verificationCodeLength: number;
  activationCodeLength: number;
  activationMaxAttempts: number;
  maxCodesPerBatch: number;
  activationPepper: string;
}

export default registerAs('codeGeneration', (): CodeGenerationOptions => ({
  verificationCodeLength: 16,
  activationCodeLength: Number(process.env.ACTIVATION_CODE_LENGTH ?? 8),
  activationMaxAttempts: Number(process.env.ACTIVATION_MAX_ATTEMPTS ?? 5),
  maxCodesPerBatch: Number(process.env.MAX_CODES_PER_BATCH ?? 10_000),
  activationPepper: process.env.CODE_ACTIVATION_PEPPER ?? '',
}));
