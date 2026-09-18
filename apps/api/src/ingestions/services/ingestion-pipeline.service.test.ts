import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { ConfigService } from '@nestjs/config';

import type {
  ProcessingJob,
  ProcessingResult,
} from '../models/processing.js';
import { IngestionPipelineService } from './ingestion-pipeline.service.js';

const JOB: ProcessingJob = {
  archivePath: 'ingestions/id/source.zip',
  ingestionId: 'ingestion-id',
  versionId: 'version-id',
  versionKey: 'soundg-version-id',
};

const RESULT: ProcessingResult = {
  bounds: [-80.2, 25.6, -80.0, 25.9],
  cells: [
    {
      edition: '4',
      name: 'US5MIABC',
      updateNumber: 2,
      updatesApplied: [1, 2],
    },
  ],
  manifestPath: 'soundg/versions/version/manifest.json',
  storagePath: 'soundg/versions/version',
};

const config = {
  getOrThrow: () => '/chart-storage',
} as ConfigService;

test('run executes the complete processing pipeline in order', async () => {
  const calls: string[] = [];
  const pipeline = new IngestionPipelineService(
    config,
    {
      claimForProcessing: async () => { calls.push('claim'); return true; },
      findIngestion: async () => { calls.push('find'); return { status: 'received' }; },
      markProcessing: async () => { calls.push('processing'); },
      markReady: async (_id: string, result: ProcessingResult) => {
        calls.push('ready');
        assert.deepEqual(result, RESULT);
      },
      publishReadyVersion: async () => { calls.push('publish'); },
    } as never,
    {
      inspect: async (archivePath: string) => {
        calls.push('inspect');
        assert.equal(
          archivePath,
          path.resolve('/chart-storage', JOB.archivePath),
        );
      },
    } as never,
    { process: async () => { calls.push('process'); return RESULT; } } as never,
  );

  await pipeline.run(JOB);

  assert.deepEqual(calls, [
    'find',
    'claim',
    'inspect',
    'processing',
    'process',
    'ready',
    'publish',
  ]);
});

test('run publishes a recovered ready version without reprocessing it', async () => {
  const calls: string[] = [];
  const pipeline = new IngestionPipelineService(
    config,
    {
      findIngestion: async () => ({ status: 'ready' }),
      publishReadyVersion: async (versionId: string) => {
        calls.push(`publish:${versionId}`);
      },
    } as never,
    { inspect: async () => { calls.push('inspect'); } } as never,
    { process: async () => { calls.push('process'); } } as never,
  );

  await pipeline.run(JOB);

  assert.deepEqual(calls, [`publish:${JOB.versionId}`]);
});

test('run stops when another worker already claimed the ingestion', async () => {
  const calls: string[] = [];
  const pipeline = new IngestionPipelineService(
    config,
    {
      claimForProcessing: async () => false,
      findIngestion: async () => ({ status: 'received' }),
    } as never,
    { inspect: async () => { calls.push('inspect'); } } as never,
    { process: async () => { calls.push('process'); } } as never,
  );

  await pipeline.run(JOB);

  assert.deepEqual(calls, []);
});

test('run persists a processing failure without publishing it', async () => {
  const failure = new Error('GDAL failed');
  const calls: string[] = [];
  const pipeline = new IngestionPipelineService(
    config,
    {
      claimForProcessing: async () => true,
      findIngestion: async () => ({ status: 'received' }),
      markFailed: async (id: string, error: unknown) => {
        calls.push(`failed:${id}`);
        assert.equal(error, failure);
      },
      markProcessing: async () => { calls.push('processing'); },
      markReady: async () => { calls.push('ready'); },
      publishReadyVersion: async () => { calls.push('publish'); },
    } as never,
    { inspect: async () => undefined } as never,
    { process: async () => { throw failure; } } as never,
  );
  (pipeline as unknown as { logger: { error: () => void } }).logger.error =
    () => undefined;

  await pipeline.run(JOB);

  assert.deepEqual(calls, ['processing', `failed:${JOB.ingestionId}`]);
});

test('URL job downloads the source into object storage once and then follows the same pipeline', async () => {
  const storageDirectory = await mkdtemp(path.join(tmpdir(), 'maris-url-worker-'));
  const downloaded = path.join(storageDirectory, 'source.zip');
  let present = false;
  let putUrlCalls = 0;
  const calls: string[] = [];
  const catalog = {
    findIngestion: async (id: string) => {
      calls.push(`find:${id}`);
      return present ? { id, status: 'received', versionId: 'version-id', versionKey: 'soundg-version-id' } : null;
    },
    createIngestion: async (input: { ingestionId: string; storagePath: string }) => {
      present = true;
      return { id: input.ingestionId, status: 'received', versionId: 'version-id', versionKey: 'soundg-version-id', storagePath: input.storagePath };
    },
    claimForProcessing: async () => true,
    markProcessing: async () => calls.push('processing'),
    markReady: async () => calls.push('ready'),
    publishReadyVersion: async () => calls.push('publish'),
    markFailed: async () => calls.push('failed'),
  } as never;
  const objectStorage = {
    tryHead: async () => present ? { ContentLength: 3 } : null,
    putUrl: async () => { putUrlCalls += 1; present = true; await writeFile(downloaded, 'zip'); },
    head: async () => ({ ContentLength: 3 }),
    downloadToFile: async (_key: string, destination: string) => { await writeFile(destination, 'zip'); },
  } as never;
  const pipeline = new IngestionPipelineService(
    { getOrThrow: (key: string) => key === 'STORAGE_DIR' ? storageDirectory : '/chart-storage' } as ConfigService,
    catalog,
    { inspect: async () => ({}) } as never,
    { process: async () => RESULT } as never,
    objectStorage,
  );

  await pipeline.run({ ...JOB, archivePath: '', objectKey: 'sources/test.zip', sourceUrl: 'https://example.com/test.zip' });
  assert.equal(putUrlCalls, 1);
  assert.deepEqual(calls.slice(-3), ['processing', 'ready', 'publish']);
  await rm(storageDirectory, { recursive: true, force: true });
});
