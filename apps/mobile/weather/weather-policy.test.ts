import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WEATHER_TTL_MS, WEATHER_RETRY_MS, isWeatherFresh } from './weather-policy';

test('weather expires after ten minutes even at the same coordinate', () => {
  assert.equal(WEATHER_TTL_MS, 600_000);
  assert.equal(isWeatherFresh(1_000, 600_999), true);
  assert.equal(isWeatherFresh(1_000, 601_000), false);
});
test('no successful response is not cached and errors can be retried', () => {
  assert.equal(isWeatherFresh(0, 5_000), false);
  assert.equal(WEATHER_RETRY_MS, 30_000);
});
