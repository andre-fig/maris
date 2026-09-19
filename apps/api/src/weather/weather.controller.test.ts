import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { GfsService } from './gfs.service.js';
import { WeatherController } from './weather.controller.js';
import { decodeGfsTile } from './gfs-tiles.js';

const successCacheControl =
  'public, s-maxage=1800, stale-while-revalidate=300';

const packageResponse = {
  model: 'gfs' as const,
  run: {
    date: '20260918',
    cycle: 12,
    run: '20260918T12:00:00Z',
    runAt: '2026-09-18T12:00:00Z',
  },
  resolution: 0.25 as const,
  bounds: { north: -22, south: -23, east: -43, west: -44 },
  forecastHours: [0],
  availableForecastHours: [0],
  grids: {},
};

async function createApp(service: Partial<Pick<GfsService, 'getPackage' | 'getTile'>>) {
  const module = await Test.createTestingModule({
    controllers: [WeatherController],
    providers: [{ provide: GfsService, useValue: service }],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

test('GET /weather/gfs makes successful responses publicly cacheable', async () => {
  const app = await createApp({ getPackage: async () => packageResponse });
  try {
    await request(app.getHttpServer())
      .get('/weather/gfs?north=-22&south=-23&east=-43&west=-44&forecastHours=0')
      .expect(200)
      .expect('Cache-Control', successCacheControl)
      .expect(({ body }) => assert.equal(body.model, 'gfs'));
  } finally {
    await app.close();
  }
});

test('GET /weather/gfs does not publicly cache backend errors', async () => {
  const app = await createApp({ getPackage: async () => {
    throw new ServiceUnavailableException('GFS unavailable');
  } });
  try {
    const response = await request(app.getHttpServer())
      .get('/weather/gfs?north=-22&south=-23&east=-43&west=-44&forecastHours=0')
      .expect(503);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.notEqual(response.headers['cache-control'], successCacheControl);
  } finally {
    await app.close();
  }
});

test('GET /weather/gfs does not publicly cache validation errors', async () => {
  const app = await createApp({ getPackage: async () => {
    throw new BadGatewayException('invalid GFS response');
  } });
  try {
    const response = await request(app.getHttpServer())
      .get('/weather/gfs?north=-22&south=-23&east=-43&west=-44&forecastHours=0')
      .expect(502);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});

test('GET /weather/gfs/tiles/:x/:y returns a compressed deterministic tile', async () => {
  const tile = {
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
  const controller = new WeatherController({ getTile: async () => tile } as GfsService);
  const headers = new Map<string, string>();
  const response = { set: (name: string, value: string) => headers.set(name, value) } as never;
  const body = await controller.getGfsTile('13', '6', '0', response);
  assert.equal(headers.get('Cache-Control'), successCacheControl);
  assert.ok(body instanceof Buffer);
  const decoded = decodeGfsTile(gunzipSync(body));
  assert.deepEqual(decoded.fields.windU, [1, 2, 3, 4]);
  assert.equal(decoded.header.width, 2);
});

test('invalid GFS tile coordinates are not publicly cacheable', async () => {
  const app = await createApp({ getTile: async () => { throw new Error('not reached'); } });
  try {
    const response = await request(app.getHttpServer())
      .get('/weather/gfs/tiles/nope/6?forecastHour=0')
      .expect(400);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});
