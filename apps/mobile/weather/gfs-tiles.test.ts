import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tileBounds, tileForCoordinate, tilesForViewport } from './gfs-tiles';

test('maps coordinates to deterministic 10 degree tiles', () => {
  assert.deepEqual(tileForCoordinate(-43.2, -22.9), { x: 13, y: 6 });
  assert.deepEqual(tileBounds({ x: 13, y: 6 }), {
    west: -50, east: -40, south: -30, north: -20,
  });
  assert.deepEqual(tileForCoordinate(180, 90), { x: 0, y: 17 });
});

test('adds one tile of margin and handles the antimeridian', () => {
  const tiles = tilesForViewport({ west: 179, east: -179, south: -1, north: 1 }, 1);
  assert.ok(tiles.some((tile) => tile.x === 35));
  assert.ok(tiles.some((tile) => tile.x === 0));
  assert.ok(tiles.some((tile) => tile.x === 34));
  assert.ok(tiles.some((tile) => tile.x === 1));
  assert.ok(tiles.every((tile) => tile.y >= 0 && tile.y < 18));
});

test('clamps polar viewports to the global tile range', () => {
  const tiles = tilesForViewport({ west: -180, east: 180, south: -90, north: 90 }, 1);
  assert.equal(new Set(tiles.map((tile) => tile.x)).size, 36);
  assert.equal(new Set(tiles.map((tile) => tile.y)).size, 18);
  assert.equal(tiles.length, 36 * 18);
});
