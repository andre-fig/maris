import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CurrentWeatherDto, WeatherForecastDto } from './dtos/current-weather.dto.js';
import { mapWeatherApiCondition } from './weather-api-condition.js';

// Primary keeps priority; bounded fallback without doubling an 8-second wait.
export const WEATHER_PROVIDER_TIMEOUT_MS = 2_500;

type OpenWeatherResponse = {
  coord: { lat: number; lon: number };
  dt: number;
  main: { humidity: number; temp: number };
  rain?: { '1h'?: number };
  snow?: { '1h'?: number };
  weather: Array<{ description: string; icon: string }>;
  wind: { deg?: number; speed: number };
};

type WeatherApiResponse = {
  location: { lat: number; lon: number };
  current: {
    last_updated_epoch: number;
    temp_c: number;
    humidity: number;
    wind_kph: number;
    wind_degree: number;
    precip_mm: number;
    is_day: number;
    condition: { text: string; code: number };
  };
  forecast?: {
    forecastday?: Array<{
      hour?: Array<{
        time_epoch: number;
        temp_c: number;
        feelslike_c: number;
        humidity: number;
        wind_kph: number;
        wind_degree: number;
        precip_mm: number;
        chance_of_rain: number;
        chance_of_snow: number;
        is_day: number;
        condition: { text: string; code: number };
      }>;
    }>;
  };
};

@Injectable()
export class WeatherService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async getCurrentWeather(
    latitude: number,
    longitude: number,
  ): Promise<CurrentWeatherDto> {
    return this.getCurrentConditions(latitude, longitude);
  }

  private async getCurrentConditions(latitude: number, longitude: number) {
    const openWeatherKey = this.config.get<string>('OPENWEATHER_API_KEY');
    const weatherApiKey = this.config.get<string>('WEATHERAPI_API_KEY');

    if (!openWeatherKey && !weatherApiKey) {
      throw new ServiceUnavailableException('Weather service is not configured');
    }

    if (weatherApiKey) {
      try {
        return await this.fetchWeatherApi(latitude, longitude, weatherApiKey);
      } catch {
        // Fallback provider below.
      }
    }

    if (openWeatherKey) {
      try {
        return await this.fetchOpenWeather(latitude, longitude, openWeatherKey);
      } catch {
        // Both providers failed; return a single public error.
      }
    }

    throw new BadGatewayException('Weather providers are unavailable');
  }

  private async fetchOpenWeather(latitude: number, longitude: number, apiKey: string) {
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.set('lat', latitude.toString());
    url.searchParams.set('lon', longitude.toString());
    url.searchParams.set('units', 'metric');
    url.searchParams.set('appid', apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_PROVIDER_TIMEOUT_MS) });
    if (!response.ok) throw new Error('OpenWeather rejected the request');
    const payload = (await response.json()) as OpenWeatherResponse;
    const condition = payload.weather[0];
    if (!condition) throw new Error('OpenWeather returned invalid data');
    return {
      latitude: payload.coord.lat,
      longitude: payload.coord.lon,
      temperature_celsius: payload.main.temp,
      condition: condition.description,
      humidity_percent: payload.main.humidity,
      wind_speed_metres_per_second: payload.wind.speed,
      wind_direction_degrees: payload.wind.deg ?? null,
      precipitation_millimetres_last_hour: (payload.rain?.['1h'] ?? 0) + (payload.snow?.['1h'] ?? 0),
      rain_probability_percent: null,
      rain_probability_at: null,
      icon_code: condition.icon,
      observed_at: new Date(payload.dt * 1_000).toISOString(),
    };
  }

  private async fetchWeatherApi(latitude: number, longitude: number, apiKey: string) {
    const url = new URL('https://api.weatherapi.com/v1/forecast.json');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', `${latitude},${longitude}`);
    url.searchParams.set('days', '2');
    url.searchParams.set('hour_fields', 'time_epoch,temp_c,feelslike_c,humidity,wind_kph,wind_degree,precip_mm,chance_of_rain,chance_of_snow,is_day,condition');
    const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_PROVIDER_TIMEOUT_MS) });
    if (!response.ok) throw new Error('WeatherAPI rejected the request');
    const payload = (await response.json()) as WeatherApiResponse;
    const current = payload.current;
    if (!current?.condition) throw new Error('WeatherAPI returned invalid data');
    const now = Date.now() / 1000;
    const forecast = payload.forecast?.forecastday?.flatMap(day => day.hour ?? [])
      .filter(hour => hour.time_epoch >= now)
      .sort((a, b) => a.time_epoch - b.time_epoch)
      .map((hour): WeatherForecastDto => ({
        forecast_at: new Date(hour.time_epoch * 1_000).toISOString(),
        temperature_celsius: hour.temp_c,
        feels_like_celsius: hour.feelslike_c,
        condition: hour.condition.text,
        humidity_percent: hour.humidity,
        wind_speed_metres_per_second: hour.wind_kph / 3.6,
        wind_direction_degrees: hour.wind_degree,
        precipitation_millimetres: hour.precip_mm,
        rain_probability_percent: hour.chance_of_rain,
        snow_probability_percent: hour.chance_of_snow,
        icon_code: mapWeatherApiCondition(hour.condition.code, hour.is_day === 1),
        is_day: hour.is_day === 1,
      }));
    const nextHour = forecast?.[0];
    return {
      latitude: payload.location.lat,
      longitude: payload.location.lon,
      temperature_celsius: current.temp_c,
      condition: current.condition.text,
      humidity_percent: current.humidity,
      wind_speed_metres_per_second: current.wind_kph / 3.6,
      wind_direction_degrees: current.wind_degree,
      precipitation_millimetres_last_hour: current.precip_mm,
      rain_probability_percent: nextHour?.rain_probability_percent ?? null,
      rain_probability_at: nextHour?.forecast_at ?? null,
      icon_code: mapWeatherApiCondition(current.condition.code, current.is_day === 1),
      observed_at: new Date(current.last_updated_epoch * 1_000).toISOString(),
      ...(forecast ? { forecast } : {}),
    };
  }
}
