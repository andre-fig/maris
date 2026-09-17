import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { zipSync } from 'fflate';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';

let storageDirectory: string;
let app: INestApplication;

before(async () => {
  storageDirectory = await mkdtemp(path.join(tmpdir(), 'maris-api-test-'));
  process.env.STORAGE_DIR = storageDirectory;
  process.env.MAX_ARCHIVE_ENTRIES = '100';
  process.env.MAX_UNCOMPRESSED_BYTES = `${10 * 1024 * 1024}`;
  process.env.MAX_UPLOAD_BYTES = `${5 * 1024 * 1024}`;

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  await app.init();
});

after(async () => {
  await app?.close();
  await rm(storageDirectory, { force: true, recursive: true });
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

test('publishes versioned MapLibre vector tiles on demand', async () => {
  const metadata = await request(app.getHttpServer()).get('/tiles/soundg.json');

  assert.equal(metadata.statusCode, 200);
  assert.equal(metadata.body.tilejson, '3.0.0');
  assert.equal(metadata.body.version, 'miami-soundg-v2');
  assert.match(metadata.body.tiles[0], /\{z\}\/\{x\}\/\{y\}\.pbf$/);

  const tile = await request(app.getHttpServer()).get(
    '/tiles/soundg/miami-soundg-v2/11/567/872.pbf',
  );

  assert.equal(tile.statusCode, 200);
  assert.match(tile.headers['content-type'], /mapbox-vector-tile/);
  assert.match(tile.headers['cache-control'], /immutable/);
  assert.ok(Number(tile.headers['content-length']) > 0);

  const cached = await request(app.getHttpServer())
    .get('/tiles/soundg/miami-soundg-v2/11/567/872.pbf')
    .set('if-none-match', tile.headers.etag);
  assert.equal(cached.statusCode, 304);
});
