import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import type { ProcessingJob } from '../models/processing.js';
import { ChartCatalogService } from './chart-catalog.service.js';
import { IngestionPipelineService } from './ingestion-pipeline.service.js';

@Injectable()
export class ProcessingDispatcherService implements OnApplicationBootstrap {
  private readonly activeJobs = new Set<string>();
  private readonly logger = new Logger(ProcessingDispatcherService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ChartCatalogService)
    private readonly catalog: ChartCatalogService,
    @Inject(IngestionPipelineService)
    private readonly pipeline: IngestionPipelineService,
  ) {}

  async onApplicationBootstrap() {
    if (!this.database.isEnabled()) return;
    for (const job of await this.catalog.listRecoverableJobs()) {
      this.dispatch(job);
    }
  }

  dispatch(job: ProcessingJob) {
    if (this.activeJobs.has(job.ingestionId)) return;
    this.activeJobs.add(job.ingestionId);
    setImmediate(() => {
      void this.pipeline
        .run(job)
        .catch((error: unknown) => {
          this.logger.error(
            `Unrecoverable pipeline error for ${job.ingestionId}`,
            error instanceof Error ? error.stack : String(error),
          );
        })
        .finally(() => {
          this.activeJobs.delete(job.ingestionId);
        });
    });
  }
}
