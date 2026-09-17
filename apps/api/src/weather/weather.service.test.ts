import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import type { ConfigService } from '@nestjs/config';

import { WeatherService } from './weather.service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('maps only current OpenWeather fields into the public response', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        coord: { lat: 25.76, lon: -80.19 },
        dt: 1_789_637_400,
        main: { humidity: 72, temp: 26.4 },
        rain: { '1h': 1.2 },
        weather: [{ description: 'light rain', icon: '10d' }],
        wind: { deg: 135, speed: 4.6 },
      }),
      { status: 200 },
    );
  const config = { get: () => 'test-key' } as unknown as ConfigService;
  const service = new WeatherService(config);

  const weather = await service.getCurrentWeather(25.76, -80.19);

  assert.deepEqual(weather, {
    latitude: 25.76,
    longitude: -80.19,
    temperature_celsius: 26.4,
    condition: 'light rain',
    humidity_percent: 72,
    wind_speed_metres_per_second: 4.6,
    wind_direction_degrees: 135,
    precipitation_millimetres_last_hour: 1.2,
    icon_code: '10d',
    observed_at: new Date(1_789_637_400_000).toISOString(),
  });
});
