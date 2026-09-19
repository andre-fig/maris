import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolutionForZoom, resolutionWithHysteresis } from './gfs-resolution';

test('selects meteorological resolution by zoom band', () => {
  assert.equal(resolutionForZoom(0), 1);
  assert.equal(resolutionForZoom(5), 1);
  assert.equal(resolutionForZoom(6), 0.5);
  assert.equal(resolutionForZoom(9), 0.5);
  assert.equal(resolutionForZoom(10), 0.25);
  assert.equal(resolutionForZoom(16), 0.25);
});

test('hysteresis avoids resolution thrashing at thresholds', () => {
  assert.equal(resolutionWithHysteresis(1, 5.4), 1);
  assert.equal(resolutionWithHysteresis(1, 5.6), 0.5);
  assert.equal(resolutionWithHysteresis(0.5, 5), 0.5);
  assert.equal(resolutionWithHysteresis(0.5, 4.4), 1);
  assert.equal(resolutionWithHysteresis(0.5, 9.4), 0.5);
  assert.equal(resolutionWithHysteresis(0.5, 9.6), 0.25);
  assert.equal(resolutionWithHysteresis(0.25, 8.6), 0.25);
  assert.equal(resolutionWithHysteresis(0.25, 8.4), 0.5);
});
