import { Controller, Get, Inject } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get()
  async getHealth() {
    const database = await this.database.check();
    return { database, status: database === 'down' ? 'degraded' : 'ok' };
  }
}
