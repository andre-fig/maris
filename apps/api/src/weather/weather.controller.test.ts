import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { GfsService } from './gfs.service.js';
import { WeatherController } from './weather.controller.js';

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

async function createApp(getPackage: GfsService['getPackage']) {
  const module = await Test.createTestingModule({
    controllers: [WeatherController],
    providers: [{ provide: GfsService, useValue: { getPackage } }],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  return app;
}

test('GET /weather/gfs makes successful responses publicly cacheable', async () => {
  const app = await createApp(async () => packageResponse);
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
  const app = await createApp(async () => {
    throw new ServiceUnavailableException('GFS unavailable');
  });
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
  const app = await createApp(async () => {
    throw new BadGatewayException('invalid GFS response');
  });
  try {
    const response = await request(app.getHttpServer())
      .get('/weather/gfs?north=-22&south=-23&east=-43&west=-44&forecastHours=0')
      .expect(502);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await app.close();
  }
});
