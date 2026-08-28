import { registerAs } from '@nestjs/config';

export interface AppOptions {
  port: number; apiPrefix: string; corsOrigins: string[];
  otp: { ttlSeconds: number; maxAttempts: number };
}

export default registerAs('app', (): AppOptions => ({
  port: Number(process.env.PORT ?? 3001),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://localhost:5174,http://localhost:5175'
  )
    .split(',')
    .map((x) => x.trim()),
  otp: {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 600),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
  },
}));
