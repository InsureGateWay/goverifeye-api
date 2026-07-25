import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { ArtifactJobService } from './artifact-job.service';
import { EmailMessage, OutlookEmailService } from './outlook-email.service';
import { OutboxMessageEntity } from './operations.entity';

type DeliveryError = Error & {
  code?: string;
  command?: string;
  responseCode?: number;
  syscall?: string;
};

export function formatDeliveryError(error: unknown) {
  if (!(error instanceof Error)) return 'Unknown delivery error';
  const smtp = error as DeliveryError;
  const details = [
    `message="${sanitize(error.message)}"`,
    smtp.code ? `code=${sanitize(smtp.code)}` : undefined,
    smtp.responseCode ? `smtpStatus=${smtp.responseCode}` : undefined,
    smtp.command ? `command=${sanitize(smtp.command)}` : undefined,
    smtp.syscall ? `syscall=${sanitize(smtp.syscall)}` : undefined,
  ].filter(Boolean);
  return details.join(' ').slice(0, 1000);
}

function sanitize(value: string) {
  let sanitized = value.replace(/[\r\n\t]+/g, ' ').trim();
  for (const secret of [process.env.SMTP_PASSWORD, process.env.SMTP_USER]) {
    if (secret) sanitized = sanitized.replaceAll(secret, '[redacted]');
  }
  return sanitized.replace(/(pass(?:word)?|auth|token)=([^\s&]+)/gi, '$1=[redacted]');
}

@Injectable()
export class OutboxProcessorService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: DataSource,
    private readonly email: OutlookEmailService,
    private readonly artifacts: ArtifactJobService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.OUTBOX_WORKER_ENABLED !== 'false') {
      this.timer = setInterval(() => void this.drain(), Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5000));
    }
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (let count = 0; count < 20; count++) {
        const item = await this.claim();
        if (!item) break;
        await this.process(item);
      }
    } catch (error) {
      const diagnostic = formatDeliveryError(error);
      this.logger.error(
        `Outbox polling interrupted by database failure; the application will remain running and retry on the next poll. error={${diagnostic}}`,
      );
    } finally {
      this.running = false;
    }
  }

  private claim() {
    return this.db.transaction(async (manager) => {
      const item = await manager.findOne(OutboxMessageEntity, {
        where: { status: 'pending', availableAt: LessThanOrEqual(new Date()) },
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      if (!item) return null;
      item.status = 'processing';
      item.attempts++;
      return manager.save(OutboxMessageEntity, item);
    });
  }

  private async process(item: OutboxMessageEntity) {
    const repository = this.db.getRepository(OutboxMessageEntity);
    try {
      let externalId: string | undefined;
      if (item.topic === 'email.send') {
        externalId = (await this.email.send(item.payload as unknown as EmailMessage)).id;
      } else if (item.topic === 'job.created') {
        await this.artifacts.process(String(item.payload.jobId));
      } else {
        throw new Error(`No outbox handler for ${item.topic}`);
      }
      item.status = 'processed';
      item.processedAt = new Date();
      item.externalId = externalId;
      item.payload = { delivered: true };
      item.lastError = undefined;
    } catch (error) {
      const maxAttempts = Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 8);
      item.lastError = formatDeliveryError(error);
      item.status = item.attempts >= maxAttempts ? 'dead_letter' : 'pending';
      item.availableAt = new Date(Date.now() + Math.min(3600, 2 ** item.attempts * 10) * 1000);
      const retry = item.status === 'pending' ? `nextRetry=${item.availableAt.toISOString()}` : 'noMoreRetries=true';
      this.logger.warn(
        `Outbox delivery failed id=${item.id} topic=${item.topic} attempt=${item.attempts}/${maxAttempts} status=${item.status} ${retry} error={${item.lastError}}`,
      );
    }
    await repository.save(item);
  }
}
