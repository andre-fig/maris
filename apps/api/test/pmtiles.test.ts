import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
import { LocalChartStorageService } from '../src/tiles/storage/local-chart-storage.service.js';
import { TilesController } from '../src/tiles/tiles.controller.js';
import { TilesService } from '../src/tiles/tiles.service.js';
import type { ChartCatalogService } from '../src/ingestions/services/chart-catalog.service.js';

test('PMTiles generation preserves MVT bytes and publishes only archive + manifest', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'maris-pmtiles-'));
  try {
    const source = { type: 'FeatureCollection' as const, features: [
      { type: 'Feature' as const, properties: { DEPTH: 21, SOURCE_CELL: 'test' }, geometry: { type: 'Point' as const, coordinates: [-80.15, 25.7] } },
      ...Array.from({ length: 40 }, (_, i) => ({
        type: 'Feature' as const, properties: { DEPTH: i, SOURCE_CELL: 'adjacent' },
        geometry: { type: 'Point' as const, coordinates: [-80.18 + i * 0.003, 25.68 + i * 0.002] },
      })),
    ] };
    const input = path.join(directory, 'source.json');
    await writeFile(input, JSON.stringify(source));
    const builder = fileURLToPath(new URL('../scripts/build-soundg-tiles.ts', import.meta.url));
    const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
    const args = [tsx, builder, '--input', input, '--storage-dir', directory, '--version', 'v1'];
    await promisify(execFile)(process.execPath, args);
    const versionPath = path.join(directory, 'soundg/versions/v1');
    assert.deepEqual((await readdir(versionPath)).sort(), ['manifest.json', 'tiles.pmtiles']);
    const storage = new LocalChartStorageService(new ConfigService({ CHART_STORAGE_DIR: directory }));
    const manifest = await storage.getManifest('soundg', 'v1');
    assert.equal(manifest.storageFormat, 'pmtiles');
    const index = geojsonvt(source, { buffer: 64, extent: 4096, indexMaxZoom: 12, maxZoom: 16, tolerance: 3 });
    const expected = Buffer.from(vtpbf.fromGeojsonVt({ soundings: index.getTile(14, 4544, 6981)! }));
    assert.deepEqual(await storage.getTile('soundg', 'v1', 14, 4544, 6981), expected);
    // Compare every relevant tile at every zoom with the original index,
    // including buffered points and siblings revisited after subtree eviction.
    for (let z = 8; z <= 16; z++) {
      const n = 2 ** z;
      const x = (lng: number) => Math.floor((lng + 180) / 360 * n);
      const y = (lat: number) => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
      for (let tx = x(-80.18) - 1; tx <= x(-80.063) + 1; tx++) {
        for (let ty = y(25.758) - 1; ty <= y(25.68) + 1; ty++) {
          const tile = index.getTile(z, tx, ty);
          const bytes = tile?.features.length ? Buffer.from(vtpbf.fromGeojsonVt({ soundings: tile })) : undefined;
          assert.deepEqual(await storage.getTile('soundg', 'v1', z, tx, ty), bytes, `${z}/${tx}/${ty}`);
        }
      }
    }
    assert.equal(await storage.getTile('soundg', 'v1', 14, 0, 0), undefined);
    await assert.rejects(storage.getTile('soundg', 'missing', 14, 0, 0));
    const module = await Test.createTestingModule({
      controllers: [TilesController],
      providers: [{ provide: TilesService, useValue: new TilesService(storage, {} as ChartCatalogService) }],
    }).compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      await request(app.getHttpServer()).get('/tiles/soundg/v1/14/4544/6981.pbf')
        .expect(200).expect('Cache-Control', 'public, max-age=31536000, immutable')
        .expect('Content-Type', /application\/vnd.mapbox-vector-tile/);
      await request(app.getHttpServer()).get('/tiles/soundg/v1/14/0/0.pbf')
        .expect(204).expect('Cache-Control', 'public, max-age=31536000, immutable');
      await request(app.getHttpServer()).get('/tiles/soundg/missing/14/0/0.pbf')
        .expect(404).expect('Cache-Control', 'no-store');
      await request(app.getHttpServer()).get('/tiles/soundg/v1/14/999999/0.pbf')
        .expect(400).expect('Cache-Control', 'no-store');
    } finally { await app.close(); }
    const original = await readFile(path.join(versionPath, 'tiles.pmtiles'));
    await assert.rejects(promisify(execFile)(process.execPath, args), /already exists/);
    assert.deepEqual(await readFile(path.join(versionPath, 'tiles.pmtiles')), original);
    assert.deepEqual(await readdir(path.join(directory, 'soundg/versions')), ['v1']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
