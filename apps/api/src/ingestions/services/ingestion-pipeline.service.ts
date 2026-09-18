import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ProcessingJob } from '../models/processing.js';
import { ChartCatalogService } from './chart-catalog.service.js';
import { EncArchiveService } from './enc-archive.service.js';
import { EncProcessingService } from './enc-processing.service.js';
import { ObjectStorageService } from '../../storage/object-storage.service.js';

@Injectable()
export class IngestionPipelineService {
  private readonly logger = new Logger(IngestionPipelineService.name);
  private readonly storageDirectory: string;

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(ChartCatalogService)
    private readonly catalog: ChartCatalogService,
    @Inject(EncArchiveService)
    private readonly archiveService: EncArchiveService,
    @Inject(EncProcessingService)
    private readonly processor: EncProcessingService,
    private readonly objectStorage: ObjectStorageService,
  ) {
    this.storageDirectory = path.resolve(
      config.getOrThrow<string>('STORAGE_DIR'),
    );
  }

  async run(job: ProcessingJob, propagateFailure = false) {
    const temporary = job.objectKey ? path.join(this.storageDirectory, '.processing', `${Date.now()}-${Math.random().toString(36).slice(2)}.zip`) : null;
    try {
      if (job.objectKey) {
        await mkdir(path.dirname(temporary!), { recursive: true });
        if (!(await this.objectStorage.tryHead(job.objectKey))) {
          if (!job.sourceUrl) throw new Error(`Source object ${job.objectKey} is missing from object storage`);
          await this.objectStorage.putUrl(job.objectKey, job.sourceUrl);
        }
        const sourceHead = await this.objectStorage.head(job.objectKey);
        if (job.sizeBytes && Number(sourceHead.ContentLength ?? 0) !== job.sizeBytes) {
          throw new Error(`Source object size mismatch: expected ${job.sizeBytes}, got ${sourceHead.ContentLength ?? 0}`);
        }
        await this.objectStorage.downloadToFile(job.objectKey, temporary!);
        const archive = await this.archiveService.inspect(temporary!);
        const checksum = createHash('sha256'); for await (const chunk of createReadStream(temporary!)) checksum.update(chunk);
        const existing = await this.catalog.findIngestion(job.ingestionId);
        if (existing) {
          job = { ...job, archivePath: path.relative(this.storageDirectory, temporary!), ingestionId: existing.id, versionId: existing.versionId, versionKey: existing.versionKey };
        } else {
          const checksumValue = checksum.digest('hex');
          const created = await this.catalog.createIngestion({ archive, checksum: checksumValue, ingestionId: job.ingestionId, originalFilename: job.sourceFilename ?? path.basename(job.objectKey), sizeBytes: job.sizeBytes ?? 0, storagePath: path.relative(this.storageDirectory, temporary!), objectKey: job.objectKey });
          job = { ...job, archivePath: created.storagePath, ingestionId: created.id, versionId: created.versionId, versionKey: created.versionKey };
        }
      }
      const current = await this.catalog.findIngestion(job.ingestionId!);
      if (current?.status === 'published') return;
      if (current?.status === 'ready') {
        await this.catalog.publishReadyVersion(job.versionId!);
        this.logger.log(`Published recovered chart version ${job.versionKey}`);
        return;
      }
      if (!(await this.catalog.claimForProcessing(job.ingestionId!))) return;
      await this.archiveService.inspect(
        path.join(this.storageDirectory, job.archivePath!),
      );
      await this.catalog.markProcessing(job.ingestionId!);
      const result = await this.processor.process(job);
      await this.catalog.markReady(job.ingestionId!, result);
      await this.catalog.publishReadyVersion(job.versionId!);
      this.logger.log(`Published chart version ${job.versionKey}`);
    } catch (error) {
      this.logger.error(
        `Chart processing failed for ingestion ${job.ingestionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      if (job.ingestionId) await this.catalog.markFailed(job.ingestionId, error);
      if (propagateFailure) throw error;
    } finally { if (temporary) await rm(temporary, { force: true }); }
  }
}
