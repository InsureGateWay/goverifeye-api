import { Injectable, LoggerService, LogLevel } from '@nestjs/common';

const sensitiveKeys = /^(authorization|cookie|password|secret|token|accessToken|refreshToken|apiKey|code)$/i;
const enabledLevels: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

export function redactLogValue(value: unknown, key?: string): unknown {
  if (key && sensitiveKeys.test(key)) return '[redacted]';
  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[^\s"]+/gi, 'Bearer [redacted]')
      .replace(/\bre_[A-Za-z0-9_-]{12,}\b/g, '[redacted]')
      .replace(/(password|secret|token|api[_-]?key)=([^\s&]+)/gi, '$1=[redacted]');
  }
  if (Array.isArray(value)) return value.map((entry) => redactLogValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactLogValue(entryValue, entryKey)]));
  }
  return value;
}

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private readonly json = process.env.LOG_FORMAT === 'json' || (process.env.LOG_FORMAT !== 'pretty' && process.env.NODE_ENV === 'production');
  private readonly minimum = enabledLevels.indexOf((process.env.LOG_LEVEL as LogLevel | undefined) ?? 'log');

  log(message: unknown, ...optional: unknown[]) { this.write('log', message, optional); }
  error(message: unknown, ...optional: unknown[]) { this.write('error', message, optional); }
  warn(message: unknown, ...optional: unknown[]) { this.write('warn', message, optional); }
  debug(message: unknown, ...optional: unknown[]) { this.write('debug', message, optional); }
  verbose(message: unknown, ...optional: unknown[]) { this.write('verbose', message, optional); }
  fatal(message: unknown, ...optional: unknown[]) { this.write('fatal', message, optional); }

  private write(level: LogLevel, message: unknown, optional: unknown[]) {
    const index = enabledLevels.indexOf(level);
    if (index > this.minimum && !['fatal', 'error'].includes(level)) return;
    const context = typeof optional.at(-1) === 'string' && !String(optional.at(-1)).includes('\n') ? optional.pop() : undefined;
    const safeMessage = redactLogValue(message);
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service: 'goverifeye-api',
      ...(context ? { context } : {}),
      ...(safeMessage && typeof safeMessage === 'object' ? safeMessage as object : { message: safeMessage }),
      ...(optional.length ? { details: redactLogValue(optional) } : {}),
    };
    const output = this.json ? JSON.stringify(record) : this.pretty(record);
    if (['fatal', 'error'].includes(level)) console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);
  }

  private pretty(record: Record<string, unknown>) {
    const { timestamp, level, context, message, ...details } = record;
    const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
    return `${timestamp} ${String(level).toUpperCase()}${context ? ` [${String(context)}]` : ''} ${String(message ?? '')}${suffix}`;
  }
}
