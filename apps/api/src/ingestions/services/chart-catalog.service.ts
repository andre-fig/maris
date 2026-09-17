import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import type { EncArchiveDto } from '../dtos/ingestion.dto.js';
import type {
  IngestionStatus,
  ProcessingJob,
  ProcessingResult,
} from '../models/processing.js';

type IngestionRow = {
  archive_storage_path: string;
  checksum_sha256: string;
  created_at: Date;
  dataset_id: string;
  dataset_key: string;
  error_message: string | null;
  id: string;
  source_cells: EncArchiveDto['cells'];
  source_filename: string;
  source_size_bytes: string;
  status: IngestionStatus;
  updated_at: Date;
  version_id: string;
  version_key: string;
};

export type CatalogIngestion = {
  archive: Pick<EncArchiveDto, 'cells'>;
  checksum: { algorithm: 'sha256'; value: string };
  createdAt: string;
  datasetId: string;
  error: string | null;
  id: string;
  originalFilename: string;
  sizeBytes: number;
  sourceType: 'S57';
  status: IngestionStatus;
  storagePath: string;
  updatedAt: string;
  versionId: string;
  versionKey: string;
};

@Injectable()
export class ChartCatalogService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async createIngestion(input: {
    archive: EncArchiveDto;
    checksum: string;
    ingestionId: string;
    originalFilename: string;
    sizeBytes: number;
    storagePath: string;
  }): Promise<CatalogIngestion> {
    const ingestionId = input.ingestionId;
    const versionId = randomUUID();
    const datasetKey = 'soundg';
    const versionKey = `${datasetKey}-${versionId}`;

    await this.database.transaction(async (client) => {
      const dataset = await client.query<{ id: string }>(
        `SELECT id FROM chart_datasets WHERE key = $1`,
        [datasetKey],
      );
      const datasetId = dataset.rows[0]?.id;
      if (!datasetId) throw new Error(`Dataset ${datasetKey} is not configured`);

      await client.query(
        `INSERT INTO chart_ingestions (
          id, dataset_id, status, source_filename, checksum_sha256,
          source_size_bytes, archive_storage_path, source_cells
        ) VALUES ($1, $2, 'received', $3, $4, $5, $6, $7::jsonb)`,
        [
          ingestionId,
          datasetId,
          input.originalFilename,
          input.checksum,
          input.sizeBytes,
          input.storagePath,
          JSON.stringify(input.archive.cells),
        ],
      );
      await client.query(
        `INSERT INTO chart_versions (
          id, ingestion_id, dataset_id, version_key, status
        ) VALUES ($1, $2, $3, $4, 'received')`,
        [versionId, ingestionId, datasetId, versionKey],
      );
    });

    const ingestion = await this.findIngestion(ingestionId);
    if (!ingestion) throw new Error('Created ingestion could not be loaded');
    return ingestion;
  }

  async findIngestion(id: string): Promise<CatalogIngestion | null> {
    const result = await this.database.query<IngestionRow>(
      `SELECT i.id, i.dataset_id, d.key AS dataset_key, i.status,
        i.source_filename, i.checksum_sha256, i.source_size_bytes,
        i.archive_storage_path, i.source_cells, i.error_message,
        i.created_at, i.updated_at, v.id AS version_id, v.version_key
      FROM chart_ingestions i
      JOIN chart_datasets d ON d.id = i.dataset_id
      JOIN chart_versions v ON v.ingestion_id = i.id
      WHERE i.id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? this.toIngestion(row) : null;
  }

  async listRecoverableJobs(): Promise<ProcessingJob[]> {
    const result = await this.database.query<{
      archive_storage_path: string;
      id: string;
      version_id: string;
      version_key: string;
    }>(
      `SELECT i.id, i.archive_storage_path, v.id AS version_id, v.version_key
      FROM chart_ingestions i
      JOIN chart_versions v ON v.ingestion_id = i.id
      WHERE i.status IN ('received', 'validating', 'processing', 'ready')
      ORDER BY i.created_at`,
    );
    return result.rows.map((row) => ({
      archivePath: row.archive_storage_path,
      ingestionId: row.id,
      versionId: row.version_id,
      versionKey: row.version_key,
    }));
  }

  async claimForProcessing(ingestionId: string): Promise<boolean> {
    return this.database.transaction(async (client) => {
      const claimed = await client.query(
        `UPDATE chart_ingestions
        SET status = 'validating', error_message = NULL, error_stack = NULL,
          processing_started_at = COALESCE(processing_started_at, now()),
          updated_at = now()
        WHERE id = $1 AND status IN ('received', 'validating', 'processing')
        RETURNING id`,
        [ingestionId],
      );
      if (claimed.rowCount !== 1) return false;
      await client.query(
        `UPDATE chart_versions
        SET status = 'validating', error_message = NULL, error_stack = NULL,
          updated_at = now()
        WHERE ingestion_id = $1 AND status IN ('received', 'validating', 'processing')`,
        [ingestionId],
      );
      return true;
    });
  }

  async markProcessing(ingestionId: string) {
    await this.updateStatus(ingestionId, 'processing');
  }

  async markReady(ingestionId: string, result: ProcessingResult) {
    const maximumUpdate = Math.max(
      0,
      ...result.cells.map((cell) => cell.updateNumber),
    );
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE chart_ingestions SET status = 'ready', processed_at = now(),
          updated_at = now(), error_message = NULL, error_stack = NULL
        WHERE id = $1`,
        [ingestionId],
      );
      await client.query(
        `UPDATE chart_versions SET status = 'ready', edition_metadata = $2::jsonb,
          update_number = $3, bounds = $4::jsonb, storage_path = $5,
          manifest_path = $6, processed_at = now(), updated_at = now(),
          error_message = NULL, error_stack = NULL
        WHERE ingestion_id = $1`,
        [
          ingestionId,
          JSON.stringify(result.cells),
          maximumUpdate,
          JSON.stringify(result.bounds),
          result.storagePath,
          result.manifestPath,
        ],
      );
    });
  }

  async markFailed(ingestionId: string, error: unknown) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const message = normalized.message.slice(0, 4_000);
    const stack = normalized.stack?.slice(0, 16_000) ?? null;
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE chart_ingestions SET status = 'failed', error_message = $2,
          error_stack = $3, processed_at = now(), updated_at = now()
        WHERE id = $1`,
        [ingestionId, message, stack],
      );
      await client.query(
        `UPDATE chart_versions SET status = 'failed', active = false,
          error_message = $2, error_stack = $3, processed_at = now(),
          updated_at = now() WHERE ingestion_id = $1`,
        [ingestionId, message, stack],
      );
    });
  }

  async publishReadyVersion(versionId: string) {
    return this.database.transaction(async (client) => {
      const version = await client.query<{
        dataset_id: string;
        ingestion_id: string;
        status: IngestionStatus;
        version_key: string;
      }>(
        `SELECT dataset_id, ingestion_id, status, version_key
        FROM chart_versions WHERE id = $1 FOR UPDATE`,
        [versionId],
      );
      const row = version.rows[0];
      if (!row) throw new NotFoundException('Chart version not found');
      if (row.status !== 'ready') {
        throw new ConflictException('Only ready chart versions can be published');
      }

      await client.query(
        `SELECT id FROM chart_datasets WHERE id = $1 FOR UPDATE`,
        [row.dataset_id],
      );

      await client.query(
        `UPDATE chart_versions SET active = false, updated_at = now()
        WHERE dataset_id = $1 AND active = true`,
        [row.dataset_id],
      );
      await client.query(
        `UPDATE chart_versions SET status = 'published', active = true,
          published_at = now(), updated_at = now() WHERE id = $1`,
        [versionId],
      );
      await client.query(
        `UPDATE chart_ingestions SET status = 'published', published_at = now(),
          updated_at = now() WHERE id = $1`,
        [row.ingestion_id],
      );
      return row.version_key;
    });
  }

  async getActiveVersion(datasetKey: string) {
    const result = await this.database.query<{
      manifest_path: string;
      version_key: string;
    }>(
      `SELECT v.version_key, v.manifest_path
      FROM chart_versions v
      JOIN chart_datasets d ON d.id = v.dataset_id
      WHERE d.key = $1 AND v.active = true AND v.status = 'published'`,
      [datasetKey],
    );
    return result.rows[0] ?? null;
  }

  private async updateStatus(id: string, status: IngestionStatus) {
    await this.database.transaction(async (client) => {
      await client.query(
        `UPDATE chart_ingestions SET status = $2, updated_at = now() WHERE id = $1`,
        [id, status],
      );
      await client.query(
        `UPDATE chart_versions SET status = $2, updated_at = now()
        WHERE ingestion_id = $1`,
        [id, status],
      );
    });
  }

  private toIngestion(row: IngestionRow): CatalogIngestion {
    return {
      archive: { cells: row.source_cells },
      checksum: { algorithm: 'sha256', value: row.checksum_sha256 },
      createdAt: row.created_at.toISOString(),
      datasetId: row.dataset_id,
      error: row.error_message,
      id: row.id,
      originalFilename: row.source_filename,
      sizeBytes: Number(row.source_size_bytes),
      sourceType: 'S57',
      status: row.status,
      storagePath: row.archive_storage_path,
      updatedAt: row.updated_at.toISOString(),
      versionId: row.version_id,
      versionKey: row.version_key,
    };
  }
}
