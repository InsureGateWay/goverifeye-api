import type { INestApplication } from '@nestjs/common';
import { json } from 'express';

export function configureRequestBodyParsers(app: INestApplication, apiPrefix: string): void {
  app.use(`/${apiPrefix.replace(/^\/+|\/+$/g, '')}/v1/customer/concerns`, json({ limit: '1500kb' }));
  // Nest detects the scoped jsonParser above and skips its default JSON parser.
  // Register the normal parser explicitly so every other endpoint receives JSON.
  app.use(json());
}
