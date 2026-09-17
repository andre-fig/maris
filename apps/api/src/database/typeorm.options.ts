import type { DataSourceOptions } from 'typeorm';

import { ChartDataset } from '../ingestions/entities/chart-dataset.entity.js';
import { ChartIngestion } from '../ingestions/entities/chart-ingestion.entity.js';
import { ChartVersion } from '../ingestions/entities/chart-version.entity.js';
import { ChartCell } from '../ingestions/entities/chart-cell.entity.js';
import { ChartCoverage } from '../ingestions/entities/chart-coverage.entity.js';
import { ChartSurvey } from '../ingestions/entities/chart-survey.entity.js';
import { ModelEncMetadata2026091800000 } from './migrations/2026091800000-model-enc-metadata.js';
import { CreateChartCatalog2026091700000 } from './migrations/2026091700000-create-chart-catalog.js';

export function createTypeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [ChartDataset, ChartIngestion, ChartVersion, ChartCell, ChartCoverage, ChartSurvey],
    migrations: [CreateChartCatalog2026091700000, ModelEncMetadata2026091800000],
    migrationsRun: true,
    synchronize: false,
  };
}
