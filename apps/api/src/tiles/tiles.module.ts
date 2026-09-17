import { Module } from '@nestjs/common';

import { IngestionsModule } from '../ingestions/ingestions.module.js';
import { CHART_STORAGE } from './storage/chart-storage.js';
import { LocalChartStorageService } from './storage/local-chart-storage.service.js';
import { TilesController } from './tiles.controller.js';
import { TilesService } from './tiles.service.js';

@Module({
  imports: [IngestionsModule],
  controllers: [TilesController],
  providers: [
    TilesService,
    LocalChartStorageService,
    {
      provide: CHART_STORAGE,
      useExisting: LocalChartStorageService,
    },
  ],
})
export class TilesModule {}
