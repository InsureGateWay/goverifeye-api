import { registerAs } from '@nestjs/config';

export interface BatchActivationOptions {
  pepperVersion: string;
  peppers: Record<string, string>;
  windowMs: number;
  maxAttempts: number;
}

export default registerAs('batchActivation', (): BatchActivationOptions => {
  const pepperVersion = process.env.ACTIVATION_PEPPER_VERSION ?? '1';
  const pepper = process.env.CODE_ACTIVATION_PEPPER ?? '';
  const historical: unknown = JSON.parse(process.env.ACTIVATION_PEPPER_RING_JSON ?? '{}');
  if (!historical || Array.isArray(historical) || typeof historical !== 'object') throw new Error('Invalid activation pepper ring');
  const peppers: Record<string, string> = { ...historical as Record<string, string>, [pepperVersion]: pepper };
  const codeKeys = [process.env.GVE_CODE_MASTER_KEY, ...Object.values(JSON.parse(process.env.GVE_CODE_KEY_RING_JSON ?? '{}'))];
  if (!/^[\w.-]{1,32}$/.test(pepperVersion) || Object.values(peppers).some(key => typeof key !== 'string' || key.length < 32 || codeKeys.includes(key))) {
    throw new Error('Activation peppers must be independent secrets of at least 32 characters');
  }
  const maxAttempts = Number(process.env.ACTIVATION_MAX_ATTEMPTS ?? 5);
  const windowMinutes = Number(process.env.ACTIVATION_FAILURE_WINDOW_MINUTES ?? 15);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100 || !Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 60) throw new Error('Invalid activation failure limits');
  return { pepperVersion, peppers, maxAttempts, windowMs: windowMinutes * 60_000 };
});
