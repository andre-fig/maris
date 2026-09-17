import { Module } from '@nestjs/common';

import { ConfigurationModule } from './configuration/configuration.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { IngestionsModule } from './ingestions/ingestions.module.js';

@Module({
  imports: [ConfigurationModule, DatabaseModule, IngestionsModule],
  controllers: [HealthController],
})
export class AppModule {}
