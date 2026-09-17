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
import { API_CONFIG, type ApiConfig } from '../src/configuration/api-config.js';

let storageDirectory: string;
let app: INestApplication;

before(async () => {
  storageDirectory = await mkdtemp(path.join(tmpdir(), 'maris-api-test-'));
  const config: ApiConfig = {
    databaseUrl: null,
    host: '127.0.0.1',
    maxArchiveEntries: 100,
    maxUncompressedBytes: 10 * 1024 * 1024,
    maxUploadBytes: 5 * 1024 * 1024,
    port: 0,
    storageDirectory,
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(API_CONFIG)
    .useValue(config)
    .compile();
  app = module.createNestApplication();
  await app.init();
});

after(async () => {
  await app.close();
  await rm(storageDirectory, { force: true, recursive: true });
});

test('receives a NOAA-style S-57 ZIP', async () => {
  const archive = zipSync({
    'ENC_ROOT/CATALOG.031': new Uint8Array([1]),
    'ENC_ROOT/US5MIABC/US5MIABC.000': new Uint8Array([2]),
    'ENC_ROOT/US5MIABC/US5MIABC.001': new Uint8Array([3]),
  });
  const response = await request(app.getHttpServer())
    .post('/v1/ingestions/enc')
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
    .post('/v1/ingestions/enc')
    .attach('file', Buffer.from(archive), {
      contentType: 'application/zip',
      filename: 'invalid.zip',
    });

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.code, 'NO_S57_CELLS');
});
