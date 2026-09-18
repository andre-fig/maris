import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import type { ConfigService } from '@nestjs/config';

import { WeatherService, WEATHER_PROVIDER_TIMEOUT_MS } from './weather.service.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('maps WeatherAPI hourly forecast and next-hour rain probability', async () => {
  const next = Math.floor(Date.now() / 3_600_000) * 3600 + 3600;
  globalThis.fetch = async input => {
    if (input.toString().includes('forecast.json')) {
      return Response.json({
        location: { lat: 0, lon: 0 },
        current: {
          last_updated_epoch: next,
          temp_c: 20,
          humidity: 50,
          wind_kph: 7.2,
          wind_degree: 180,
          precip_mm: 0.4,
          is_day: 1,
          condition: { text: 'Clear', code: 1000 },
        },
        forecast: { forecastday: [{ hour: [{
          time_epoch: next,
          temp_c: 21,
          feelslike_c: 21.5,
          humidity: 55,
          wind_kph: 14.4,
          wind_degree: 225,
          precip_mm: 0.8,
          chance_of_rain: 70,
          chance_of_snow: 0,
          is_day: 1,
          condition: { text: 'Patchy rain', code: 1063 },
        }] }] },
      });
    }
    return Response.json({ coord: { lat: 0, lon: 0 }, dt: next,
      main: { humidity: 50, temp: 20 }, weather: [{ description: 'clear', icon: '01d' }], wind: { speed: 2 } });
  };
  const service = new WeatherService({ get: (key: string) => key === 'WEATHERAPI_API_KEY' ? 'weatherapi-key' : '' } as unknown as ConfigService);
  const weather = await service.getCurrentWeather(0, 0);
  assert.equal(weather.rain_probability_percent, 70);
  assert.equal(weather.rain_probability_at, new Date(next * 1000).toISOString());
  assert.equal(weather.forecast?.length, 1);
  assert.deepEqual(weather.forecast?.[0], {
    forecast_at: new Date(next * 1000).toISOString(),
    temperature_celsius: 21,
    feels_like_celsius: 21.5,
    condition: 'Patchy rain',
    humidity_percent: 55,
    wind_speed_metres_per_second: 4,
    wind_direction_degrees: 225,
    precipitation_millimetres: 0.8,
    rain_probability_percent: 70,
    snow_probability_percent: 0,
    icon_code: 'SHOWER_RAIN',
    is_day: true,
  });
});

test('two unresponsive providers abort within the five-second total budget', async () => {
  assert.equal(WEATHER_PROVIDER_TIMEOUT_MS, 2_500);
  let aborted = 0;
  globalThis.fetch = async (_input, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => { aborted++; reject(options.signal?.reason); }, { once: true });
  });
  // AbortSignal timeouts are unref'ed; keep this isolated test alive.
  const keepAlive = setInterval(() => {}, 100);
  try {
    const start = Date.now();
    const service = new WeatherService({ get: () => 'test-key' } as unknown as ConfigService);
    await assert.rejects(service.getCurrentWeather(25,-80), /Weather providers are unavailable/);
    assert.equal(aborted, 2);
    assert.ok(Date.now()-start < 6_000);
  } finally { clearInterval(keepAlive); }
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
    rain_probability_percent: null,
    rain_probability_at: null,
    icon_code: '10d',
    observed_at: new Date(1_789_637_400_000).toISOString(),
  });
});

test('uses WeatherAPI first and falls back to OpenWeather when WeatherAPI fails', async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = input.toString();
    requests.push(url);
    if (url.includes('weatherapi.com')) return new Response('', { status: 503 });
    return new Response(
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
  };

  const config = {
    get: (key: string) =>
      key === 'OPENWEATHER_API_KEY' ? 'open-key' : 'weatherapi-key',
  } as unknown as ConfigService;
  const service = new WeatherService(config);
  const weather = await service.getCurrentWeather(25.76, -80.19);

  assert.equal(requests.length, 2);
  const weatherApiIndex = requests.findIndex(url => url.includes('forecast.json'));
  const openWeatherIndex = requests.findIndex(url => url.includes('openweathermap.org'));
  assert.ok(weatherApiIndex >= 0);
  assert.ok(openWeatherIndex > weatherApiIndex);
  assert.equal(weather.icon_code, '10d');
  assert.equal(weather.wind_speed_metres_per_second, 4.6);
  assert.equal(weather.precipitation_millimetres_last_hour, 1.2);
});
