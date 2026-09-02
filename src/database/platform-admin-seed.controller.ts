import {
  Controller,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'crypto';
import { Public } from '../auth/public.decorator';

@ApiTags('internal-seeding')
@Controller('internal/platform-admin')
export class PlatformAdminSeedController {
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Run the idempotent platform-admin seed' })
  @ApiHeader({ name: 'x-seed-key', required: true, description: 'Dedicated deployment secret configured as PLATFORM_ADMIN_SEED_KEY' })
  @Post('seed')
  @HttpCode(200)
  async seed(@Headers('x-seed-key') suppliedKey?: string) {
    const configuredKey = process.env.PLATFORM_ADMIN_SEED_KEY;
    if (!configuredKey || configuredKey.length < 32) {
      throw new ServiceUnavailableException('Platform administrator seeding endpoint is not configured');
    }
    if (!suppliedKey || !this.matches(suppliedKey, configuredKey)) {
      throw new UnauthorizedException('Invalid seed authorization');
    }

    const { seedPlatformAdmin } = await import('./seed-platform-admin');
    await seedPlatformAdmin();
    return {
      seeded: true,
      email: (process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'senorleo12@yahoo.com').trim().toLowerCase(),
      role: 'super_admin',
    };
  }

  private matches(left: string, right: string) {
    const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
    return timingSafeEqual(digest(left), digest(right));
  }
}
