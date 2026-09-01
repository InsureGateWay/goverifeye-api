import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PlatformAdminSeedController } from './platform-admin-seed.controller';

describe('PlatformAdminSeedController', () => {
  const original = process.env.PLATFORM_ADMIN_SEED_KEY;
  const controller = new PlatformAdminSeedController();

  afterEach(() => {
    if (original === undefined) delete process.env.PLATFORM_ADMIN_SEED_KEY;
    else process.env.PLATFORM_ADMIN_SEED_KEY = original;
  });

  it('is unavailable until a strong server-side seed key is configured', async () => {
    delete process.env.PLATFORM_ADMIN_SEED_KEY;
    await expect(controller.seed('supplied')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects an invalid key without running the seed', async () => {
    process.env.PLATFORM_ADMIN_SEED_KEY = 'a-secure-key-that-is-at-least-32-characters';
    await expect(controller.seed('incorrect-key')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
