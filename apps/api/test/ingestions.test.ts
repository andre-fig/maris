import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { ConfigService } from '@nestjs/config';
import { zipSync } from 'fflate';
import { newDb } from 'pg-mem';
import type { Pool, PoolClient } from 'pg';

import {
  CHART_CATALOG_MIGRATION,
  DatabaseService,
} from '../src/database/database.service.js';
import type { EncArchiveDto } from '../src/ingestions/dtos/ingestion.dto.js';
import type {
  ProcessingJob,
  ProcessingResult,
} from '../src/ingestions/models/processing.js';
import { ChartCatalogService } from '../src/ingestions/services/chart-catalog.service.js';
import { IngestionPipelineService } from '../src/ingestions/services/ingestion-pipeline.service.js';
import { IngestionsService } from '../src/ingestions/services/ingestions.service.js';
import { LocalChartStorageService } from '../src/tiles/storage/local-chart-storage.service.js';
import { TilesService } from '../src/tiles/tiles.service.js';

const ARCHIVE: EncArchiveDto = {
  catalogPresent: true,
  cellCount: 1,
  cells: [{ name: 'US5MIABC', updateNumbers: [1, 2] }],
  compressedBytes: 100,
  entryCount: 4,
  fileCount: 4,
  uncompressedBytes: 200,
};

const RESULT: ProcessingResult = {
  bounds: [-80.265019, 25.650179, -80.026909, 25.949411],
  cells: [
    {
      edition: '4',
      name: 'US5MIABC',
      updateNumber: 2,
      updatesApplied: [1, 2],
    },
  ],
  manifestPath: 'soundg/versions/test/manifest.json',
  storagePath: 'soundg/versions/test',
};

type TestDatabase = DatabaseService & { close(): Promise<void> };

async function createDatabase(): Promise<TestDatabase> {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = memory.adapters.createPg();
  const pool: Pool = new adapter.Pool() as Pool;
  await pool.query(CHART_CATALOG_MIGRATION);

  return {
    check: async () => 'up' as const,
    close: () => pool.end(),
    isEnabled: () => true,
    onApplicationShutdown: async () => pool.end(),
    onModuleInit: async () => undefined,
    query: (text: string, values: unknown[] = []) => pool.query(text, values),
    transaction: async <T>(work: (client: PoolClient) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  } as TestDatabase;
}

function config(values: Record<string, string>) {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing ${key}`);
      return value;
    },
  } as ConfigService;
}

async function createIngestion(catalog: ChartCatalogService) {
  return catalog.createIngestion({
    archive: ARCHIVE,
    checksum: 'a'.repeat(64),
    ingestionId: crypto.randomUUID(),
    originalFilename: 'miami.zip',
    sizeBytes: 123,
    storagePath: 'ingestions/source.zip',
  });
}

function jobFor(ingestion: Awaited<ReturnType<typeof createIngestion>>): ProcessingJob {
  return {
    archivePath: ingestion.storagePath,
    ingestionId: ingestion.id,
    versionId: ingestion.versionId,
    versionKey: ingestion.versionKey,
  };
}

test('valid upload is persisted and dispatches automatic processing', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'maris-upload-test-'));
  const temporaryFile = path.join(directory, 'upload.zip');
  const archive = zipSync({
    'ENC_ROOT/US5MIABC/US5MIABC.000': new Uint8Array([1]),
    'ENC_ROOT/US5MIABC/US5MIABC.001': new Uint8Array([2]),
  });
  await writeFile(temporaryFile, archive);
  const dispatched: ProcessingJob[] = [];
  const ingestionId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const service = new IngestionsService(
    config({ STORAGE_DIR: directory }),
    { inspect: async () => ARCHIVE } as never,
    {
      createIngestion: async (input: { storagePath: string }) => ({
        archive: { cells: ARCHIVE.cells },
        checksum: { algorithm: 'sha256' as const, value: 'a'.repeat(64) },
        createdAt: new Date().toISOString(),
        datasetId: crypto.randomUUID(),
        error: null,
        id: ingestionId,
        originalFilename: 'miami.zip',
        sizeBytes: archive.byteLength,
        sourceType: 'S57' as const,
        status: 'received' as const,
        storagePath: input.storagePath,
        updatedAt: new Date().toISOString(),
        versionId,
        versionKey: `soundg-${versionId}`,
      }),
      findIngestion: async () => null,
    } as never,
    { dispatch: (job: ProcessingJob) => dispatched.push(job) } as never,
  );

  try {
    const result = await service.create({
      buffer: Buffer.alloc(0),
      destination: directory,
      encoding: '7bit',
      fieldname: 'file',
      filename: path.basename(temporaryFile),
      mimetype: 'application/zip',
      originalname: 'miami.zip',
      path: temporaryFile,
      size: archive.byteLength,
      stream: undefined as never,
    });

    assert.equal(result.status, 'received');
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0]?.ingestionId, ingestionId);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('successful processing produces ready metadata before publication', async () => {
  const database = await createDatabase();
  const catalog = new ChartCatalogService(database);
  try {
    const ingestion = await createIngestion(catalog);
    assert.equal(await catalog.claimForProcessing(ingestion.id), true);
    await catalog.markProcessing(ingestion.id);
    await catalog.markReady(ingestion.id, RESULT);

    const ready = await catalog.findIngestion(ingestion.id);
    assert.equal(ready?.status, 'ready');
    const version = await database.query<{ edition_metadata: unknown; status: string }>(
      'SELECT edition_metadata, status FROM chart_versions WHERE id = $1',
      [ingestion.versionId],
    );
    assert.equal(version.rows[0]?.status, 'ready');
    assert.deepEqual(version.rows[0]?.edition_metadata, RESULT.cells);
  } finally {
    await database.close();
  }
});

test('ready version can be published and failed version cannot', async () => {
  const database = await createDatabase();
  const catalog = new ChartCatalogService(database);
  try {
    const ready = await createIngestion(catalog);
    await catalog.markReady(ready.id, RESULT);
    assert.equal(
      await catalog.publishReadyVersion(ready.versionId),
      ready.versionKey,
    );

    const failed = await createIngestion(catalog);
    await catalog.markFailed(failed.id, new Error('GDAL failed'));
    await assert.rejects(
      catalog.publishReadyVersion(failed.versionId),
      /Only ready chart versions can be published/,
    );
  } finally {
    await database.close();
  }
});

test('publication atomically changes the single active version', async () => {
  const database = await createDatabase();
  const catalog = new ChartCatalogService(database);
  try {
    const next = await createIngestion(catalog);
    await catalog.markReady(next.id, RESULT);
    await catalog.publishReadyVersion(next.versionId);

    const active = await database.query<{ version_key: string }>(
      'SELECT version_key FROM chart_versions WHERE active = true',
    );
    assert.deepEqual(active.rows, [{ version_key: next.versionKey }]);

    const previous = await database.query<{ active: boolean; status: string }>(
      `SELECT active, status FROM chart_versions WHERE version_key = 'miami-soundg-v2'`,
    );
    assert.equal(previous.rows[0]?.active, false);
    assert.equal(previous.rows[0]?.status, 'published');
  } finally {
    await database.close();
  }
});

test('publishing a new version does not remove previous artifacts', async () => {
  const database = await createDatabase();
  const catalog = new ChartCatalogService(database);
  const directory = await mkdtemp(path.join(tmpdir(), 'maris-artifacts-test-'));
  const previousTile = path.join(
    directory,
    'soundg/versions/miami-soundg-v2/11/567/872.pbf',
  );
  await mkdir(path.dirname(previousTile), { recursive: true });
  await writeFile(previousTile, Buffer.from([1, 2, 3]));
  try {
    const next = await createIngestion(catalog);
    await catalog.markReady(next.id, RESULT);
    await catalog.publishReadyVersion(next.versionId);
    assert.deepEqual(await readFile(previousTile), Buffer.from([1, 2, 3]));
  } finally {
    await database.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('failed processing preserves the currently published version', async () => {
  const database = await createDatabase();
  const catalog = new ChartCatalogService(database);
  const ingestion = await createIngestion(catalog);
  const pipeline = new IngestionPipelineService(
    config({ STORAGE_DIR: '/tmp' }),
    catalog,
    { inspect: async () => ARCHIVE } as never,
    { process: async () => { throw new Error('ogr2ogr failed'); } } as never,
  );
  try {
    await pipeline.run(jobFor(ingestion));
    assert.equal((await catalog.findIngestion(ingestion.id))?.status, 'failed');
    assert.equal(
      (await catalog.getActiveVersion('soundg'))?.version_key,
      'miami-soundg-v2',
    );
  } finally {
    await database.close();
  }
});

test('automatic pipeline reaches published after a successful job', async () => {
  const database = await createDatabase();
  const catalog = new ChartCatalogService(database);
  const ingestion = await createIngestion(catalog);
  const pipeline = new IngestionPipelineService(
    config({ STORAGE_DIR: '/tmp' }),
    catalog,
    { inspect: async () => ARCHIVE } as never,
    { process: async () => RESULT } as never,
  );
  try {
    await pipeline.run(jobFor(ingestion));
    assert.equal(
      (await catalog.findIngestion(ingestion.id))?.status,
      'published',
    );
    assert.equal(
      (await catalog.getActiveVersion('soundg'))?.version_key,
      ingestion.versionKey,
    );
  } finally {
    await database.close();
  }
});

test('TileJSON resolves the active version from PostgreSQL', async () => {
  const database = await createDatabase();
  const catalog = new ChartCatalogService(database);
  const directory = await mkdtemp(path.join(tmpdir(), 'maris-tilejson-test-'));
  try {
    const ingestion = await createIngestion(catalog);
    const result = {
      ...RESULT,
      manifestPath: `soundg/versions/${ingestion.versionKey}/manifest.json`,
      storagePath: `soundg/versions/${ingestion.versionKey}`,
    };
    await catalog.markReady(ingestion.id, result);
    await catalog.publishReadyVersion(ingestion.versionId);

    const versionDirectory = path.join(directory, result.storagePath);
    await mkdir(versionDirectory, { recursive: true });
    await writeFile(
      path.join(versionDirectory, 'manifest.json'),
      JSON.stringify({
        bounds: RESULT.bounds,
        createdAt: new Date().toISOString(),
        dataset: 'soundg',
        format: 'mvt',
        maxzoom: 16,
        minzoom: 8,
        name: 'Miami SOUNDG',
        tilePathTemplate: `${result.storagePath}/{z}/{x}/{y}.pbf`,
        vectorLayers: [
          {
            fields: { DEPTH: 'Number' },
            id: 'soundings',
            maxzoom: 16,
            minzoom: 8,
          },
        ],
        version: ingestion.versionKey,
      }),
    );

    const storage = new LocalChartStorageService(
      config({ CHART_STORAGE_DIR: directory }),
    );
    const tiles = new TilesService(storage, catalog);
    const tileJson = await tiles.getTileJson('https://api.example.test');
    assert.equal(tileJson.version, ingestion.versionKey);
    assert.equal(
      tileJson.tiles[0],
      `https://api.example.test/tiles/soundg/${ingestion.versionKey}/{z}/{x}/{y}.pbf`,
    );
  } finally {
    await database.close();
    await rm(directory, { force: true, recursive: true });
  }
});
