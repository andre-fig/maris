import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GFS_MAX_WEATHER_ZOOM, tileBounds, tileForCoordinate, tilesForViewport } from './gfs-tiles';
import { fieldDimensionsForTiles, sourceZoomForMapZoom, sourceZoomForViewport } from './gfs-zoom';

test('maps coordinates to deterministic Web Mercator XYZ tiles', () => {
  assert.deepEqual(tileForCoordinate(-43.2, -22.9, 0), { z: 0, x: 0, y: 0 });
  const tile = tileForCoordinate(-43.2, -22.9, 6);
  assert.equal(tile.z, 6);
  const bounds = tileBounds(tile);
  assert.ok(bounds.west <= -43.2 && bounds.east >= -43.2);
  assert.ok(bounds.south <= -22.9 && bounds.north >= -22.9);
  assert.deepEqual(tileForCoordinate(180, 90, 6), { z: 6, x: 0, y: 0 });
});

test('adds one tile of margin and handles the antimeridian', () => {
  const tiles = tilesForViewport({ west: 179, east: -179, south: -1, north: 1 }, 2);
  assert.ok(tiles.some((tile) => tile.x === 3));
  assert.ok(tiles.some((tile) => tile.x === 0));
  assert.ok(tiles.some((tile) => tile.x === 2));
  assert.ok(tiles.some((tile) => tile.x === 1));
  assert.ok(tiles.every((tile) => tile.z === 2 && tile.y >= 0 && tile.y < 4));
});

test('clamps polar viewports to the global tile range', () => {
  const tiles = tilesForViewport({ west: -180, east: 180, south: -90, north: 90 }, 1);
  assert.equal(new Set(tiles.map((tile) => tile.x)).size, 2);
  assert.equal(new Set(tiles.map((tile) => tile.y)).size, 2);
  assert.equal(tiles.length, 4);
});

test('the pyramid has 1, 4, ..., 4096 tiles by level', () => {
  for (let z = 0; z <= GFS_MAX_WEATHER_ZOOM; z += 1) {
    const tiles = tilesForViewport({ west: -180, east: 180, south: -90, north: 90 }, z, 0);
    assert.equal(tiles.length, 2 ** (2 * z));
  }
});

test('source zoom follows the old rounded and clamped weather zoom', () => {
  assert.equal(sourceZoomForMapZoom(0.49), 0);
  assert.equal(sourceZoomForMapZoom(0.5), 1);
  assert.equal(sourceZoomForMapZoom(5.49), 5);
  assert.equal(sourceZoomForMapZoom(5.5), 6);
  assert.equal(sourceZoomForMapZoom(16), 6);
  assert.equal(sourceZoomForMapZoom(10, 1), 5);
});

test('field size fallback lowers source zoom for a world viewport', () => {
  const selected = sourceZoomForViewport(
    { west: -180, east: 180, south: -85, north: 85 },
    16,
  );
  assert.equal(selected.sourceZoom, 1);
  assert.ok(fieldDimensionsForTiles(selected.tiles).width <= 2048);
});
