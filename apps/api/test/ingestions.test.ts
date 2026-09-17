import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { zipSync } from 'fflate';
import request from 'supertest';

let testStorageDirectory: string;
let app: INestApplication;

before(async () => {
  testStorageDirectory = await mkdtemp(
    path.join(tmpdir(), 'maris-api-test-'),
  );
  process.env.STORAGE_DIR = testStorageDirectory;
  process.env.CHART_STORAGE_DIR = path.join(
    testStorageDirectory,
    'chart-data',
  );
  process.env.MAX_ARCHIVE_ENTRIES = '100';
  process.env.MAX_UNCOMPRESSED_BYTES = `${10 * 1024 * 1024}`;
  process.env.MAX_UPLOAD_BYTES = `${5 * 1024 * 1024}`;

  const chartRoot = path.join(testStorageDirectory, 'chart-data', 'soundg');
  const manifest = {
    bounds: [-80.265019, 25.650179, -80.026909, 25.949411],
    createdAt: '2026-09-17T00:00:00.000Z',
    dataset: 'soundg',
    format: 'mvt',
    maxzoom: 16,
    minzoom: 8,
    name: 'Miami SOUNDG',
    tilePathTemplate:
      'soundg/versions/miami-soundg-v2/{z}/{x}/{y}.pbf',
    vectorLayers: [
      {
        fields: { DEPTH: 'Number' },
        id: 'soundings',
        maxzoom: 16,
        minzoom: 8,
      },
    ],
    version: 'miami-soundg-v2',
  };
  for (const version of ['miami-soundg-v1', 'miami-soundg-v2']) {
    const versionDirectory = path.join(chartRoot, 'versions', version);
    await mkdir(versionDirectory, { recursive: true });
    await writeFile(
      path.join(versionDirectory, 'manifest.json'),
      JSON.stringify({
        ...manifest,
        tilePathTemplate: `soundg/versions/${version}/{z}/{x}/{y}.pbf`,
        version,
      }),
    );
  }
  await writeFile(
    path.join(chartRoot, 'active.json'),
    JSON.stringify({ dataset: 'soundg', version: 'miami-soundg-v2' }),
  );

  const { AppModule } = await import('../src/app.module.js');
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  await app.init();
});

after(async () => {
  await app?.close();
  const expectedPrefix = `${tmpdir()}${path.sep}maris-api-test-`;
  assert.ok(testStorageDirectory.startsWith(expectedPrefix));
  await rm(testStorageDirectory, { force: true, recursive: true });
});

test('receives a NOAA-style S-57 ZIP', async () => {
  const archive = zipSync({
    'ENC_ROOT/CATALOG.031': new Uint8Array([1]),
    'ENC_ROOT/US5MIABC/US5MIABC.000': new Uint8Array([2]),
    'ENC_ROOT/US5MIABC/US5MIABC.001': new Uint8Array([3]),
  });
  const response = await request(app.getHttpServer())
    .post('/ingestions/enc')
    .attach('file', Buffer.from(archive), {
      contentType: 'application/zip',
      filename: 'FL_ENCs.zip',
    });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.status, 'received');
  assert.equal(response.body.archive.cellCount, 1);
  assert.deepEqual(response.body.archive.cells, [
    { name: 'US5MIABC', updateNumbers: [1] },
  ]);
});

test('uses Nest exceptions for invalid ENC archives', async () => {
  const archive = zipSync({ 'ENC_ROOT/README.TXT': new Uint8Array([1]) });
  const response = await request(app.getHttpServer())
    .post('/ingestions/enc')
    .attach('file', Buffer.from(archive), {
      contentType: 'application/zip',
      filename: 'invalid.zip',
    });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.code, 'NO_S57_CELLS');
});

test('publishes TileJSON from the active immutable artifact manifest', async () => {
  const metadata = await request(app.getHttpServer()).get('/tiles/soundg.json');

  assert.equal(metadata.statusCode, 200, JSON.stringify(metadata.body));
  assert.equal(metadata.body.tilejson, '3.0.0');
  assert.equal(metadata.body.version, 'miami-soundg-v2');
  assert.match(
    metadata.body.tiles[0],
    /^http:\/\/127\.0\.0\.1:\d+\/tiles\/soundg\/miami-soundg-v2\/\{z\}\/\{x\}\/\{y\}\.pbf$/,
  );

  const oldManifest = JSON.parse(
    await readFile(
      path.join(
        testStorageDirectory,
        'chart-data',
        'soundg',
        'versions',
        'miami-soundg-v1',
        'manifest.json',
      ),
      'utf8',
    ),
  ) as { version: string };
  assert.equal(oldManifest.version, 'miami-soundg-v1');

  // Static artifacts are deliberately outside the NestJS request path.
  const tile = await request(app.getHttpServer()).get(
    '/tiles/soundg/miami-soundg-v2/11/567/872.pbf',
  );
  assert.equal(tile.statusCode, 404);
});
