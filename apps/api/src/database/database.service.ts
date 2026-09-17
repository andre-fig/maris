import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly pool: Pool | null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const databaseUrl = config.get<string>('DATABASE_URL');
    this.pool = databaseUrl
      ? new Pool({ connectionString: databaseUrl, max: 5 })
      : null;
  }

  async onModuleInit() {
    if (this.pool) await this.pool.query('select 1');
  }

  async onApplicationShutdown() {
    await this.pool?.end();
  }

  async check() {
    if (!this.pool) return 'disabled' as const;
    try {
      await this.pool.query('select 1');
      return 'up' as const;
    } catch {
      return 'down' as const;
    }
  }
}
