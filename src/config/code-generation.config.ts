import { registerAs } from '@nestjs/config';

export interface CodeGenerationOptions {
  formatVersion: string;
  keyVersion: string;
  masterKey: string;
  keyRing: Record<string,string>;
  activationCredentialLength: number;
  activationMaxAttempts: number;
  maxCodesPerBatch: number;
}

export default registerAs('codeGeneration', (): CodeGenerationOptions => {
  const keyVersion=process.env.GVE_CODE_KEY_VERSION??'1',masterKey=process.env.GVE_CODE_MASTER_KEY??'';
  let historical:Record<string,string>={};
  try{historical=JSON.parse(process.env.GVE_CODE_KEY_RING_JSON??'{}') as Record<string,string>;}catch{throw new Error('GVE_CODE_KEY_RING_JSON must be valid JSON');}
  return {
  formatVersion: '3.3.3',
  keyVersion,
  masterKey,
  keyRing:{...historical,[keyVersion]:masterKey},
  activationCredentialLength: Number(
    process.env.BATCH_ACTIVATION_CREDENTIAL_LENGTH ?? 8,
  ),
  activationMaxAttempts: Number(process.env.ACTIVATION_MAX_ATTEMPTS ?? 5),
  maxCodesPerBatch: Number(process.env.MAX_CODES_PER_BATCH ?? 10_000),
};});
