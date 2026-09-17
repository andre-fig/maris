import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';

import { API_CONFIG, type ApiConfig } from '../configuration/api-config.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly pool: Pool | null;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.pool = config.databaseUrl
      ? new Pool({ connectionString: config.databaseUrl, max: 5 })
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
