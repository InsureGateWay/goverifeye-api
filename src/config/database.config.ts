import { registerAs } from '@nestjs/config';
import type { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export type SupportedDatabase = 'postgres' | 'mysql';
export type DatabaseOptions = (PostgresConnectionOptions | MysqlConnectionOptions) & { type: SupportedDatabase };

export default registerAs('database', (): DatabaseOptions => ({
  type: (process.env.DATABASE_TYPE ?? 'postgres') as SupportedDatabase,
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
  logging: process.env.DATABASE_LOGGING === 'true',
  synchronize: false,
  autoLoadEntities: true,
  migrationsRun: true,
  migrations: ['dist/database/migrations/*.js'],
} as DatabaseOptions));
