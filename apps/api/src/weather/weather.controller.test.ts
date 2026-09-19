import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { GfsService } from './gfs.service.js';
import { WeatherController } from './weather.controller.js';
import { decodeGfsTile } from './gfs-tiles.js';

const successCacheControl =
  'public, s-maxage=1800, stale-while-revalidate=300';

function makeTestTile() {
  return {
    model: 'gfs' as const,
    run: '2026-09-18T12:00:00Z',
    forecastHour: 0,
    forecastTime: '2026-09-18T12:00:00Z',
    resolution: 0.25 as const,
    bounds: { north: -20, south: -30, east: -40, west: -50 },
    width: 2,
    height: 2,
    gridOrder: 'north-to-south,west-to-east' as const,
    longitudeConvention: '-180..180' as const,
    units: {
      wind: 'm/s' as const, temperature: 'K' as const, precipitation: 'kg/m2' as const,
      precipitationRate: 'kg/m2/s' as const, cloudCover: '%' as const, pressure: 'Pa' as const,
      gust: 'm/s' as const, humidity: '%' as const,
    },
    fields: { windU: [1, 2, 3, 4], windV: [5, 6, 7, 8] },
  };
}

async function createApp(service: Partial<GfsService>) {
  const module = await Test.createTestingModule({
    controllers: [WeatherController],
    providers: [{ provide: GfsService, useValue: service }],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

test('GET /weather/gfs/tiles/:z/:x/:y returns a compressed deterministic tile', async () => {
  const tile = makeTestTile();
  const controller = new WeatherController({
    getCompleteInventory: async () => ({ run: { runAt: tile.run }, tiles: [] }),
    getXyzTileFromInventory: async () => tile,
  } as unknown as GfsService);
  const headers = new Map<string, string>();
  const response = {
    set: (name: string, value: string) => headers.set(name, value),
    status: () => response,
    send: (value: Buffer) => value,
  } as never;
  const body = await controller.getGfsTile('6', '13', '6', '0', { header: () => undefined } as never, response);
  assert.equal(headers.get('Cache-Control'), successCacheControl);
  assert.match(headers.get('ETag') ?? '', /^"[0-9a-f]{64}"$/);
  assert.ok(body instanceof Buffer);
  const decoded = decodeGfsTile(gunzipSync(body));
  assert.deepEqual(decoded.fields.windU, [1, 2, 3, 4]);
  assert.equal(decoded.header.width, 2);
});

test('GFS tile Redis HIT avoids the origin lookup', async () => {
  let originCalls = 0;
  const cachedBody = Buffer.from('cached-gfs-tile');
  const controller = new WeatherController(
    {
      getCompleteInventory: async () => {
        originCalls += 1;
        throw new Error('origin should not be called on a Redis HIT');
      },
      getXyzTileFromInventory: async () => { throw new Error('origin should not be called on a Redis HIT'); },
    } as GfsService,
    {
      getActiveRun: async () => ({ run: '20260918T12', status: 'READY' }),
      getTile: async () => cachedBody,
      setTile: async () => true,
    } as never,
  );
  const headers = new Map<string, string>();
  const response = {
    set: (name: string, value: string) => headers.set(name, value),
    status: () => response,
    send: (value: Buffer) => value,
  } as never;

  const body = await controller.getGfsTile(
    '6',
    '13',
    '6',
    '0',
    { header: () => undefined } as never,
    response,
  );

  assert.equal(originCalls, 0);
  assert.equal(body, cachedBody);
  assert.match(headers.get('ETag') ?? '', /^"[0-9a-f]{64}"$/);
});

test('GFS tiles return 304 for a matching ETag without a body', async () => {
  const app = await createApp({
    getCompleteInventory: async () => ({ run: { runAt: makeTestTile().run }, tiles: [] }),
    getXyzTileFromInventory: async () => makeTestTile(),
  } as never);
  try {
    const first = await request(app.getHttpServer())
      .get('/weather/gfs/tiles/6/13/6?forecastHour=0')
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/weather/gfs/tiles/6/13/6?forecastHour=0')
      .set('If-None-Match', first.headers.etag)
      .expect(304);
    assert.equal(second.headers.etag, first.headers.etag);
    assert.equal(second.headers['cache-control'], successCacheControl);
    assert.equal(second.headers['content-type'], 'application/octet-stream');
    assert.equal(second.body.length, 0);
  } finally {
    await app.close();
  }
});

test('invalid GFS tile coordinates are not publicly cacheable', async () => {
  const app = await createApp({ getCompleteInventory: async () => { throw new Error('not reached'); } });
  try {
    const response = await request(app.getHttpServer())
      .get('/weather/gfs/tiles/6/nope/6?forecastHour=0')
      .expect(400);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});
