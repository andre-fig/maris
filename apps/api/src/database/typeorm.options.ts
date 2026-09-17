import type { DataSourceOptions } from 'typeorm';

import { ChartDataset } from '../ingestions/entities/chart-dataset.entity.js';
import { ChartIngestion } from '../ingestions/entities/chart-ingestion.entity.js';
import { ChartVersion } from '../ingestions/entities/chart-version.entity.js';
import { CreateChartCatalog2026091700000 } from './migrations/2026091700000-create-chart-catalog.js';

export function createTypeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [ChartDataset, ChartIngestion, ChartVersion],
    migrations: [CreateChartCatalog2026091700000],
    migrationsRun: true,
    synchronize: false,
  };
}
