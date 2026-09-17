import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { CurrentWeatherDto } from './dtos/current-weather.dto.js';

type OpenWeatherResponse = {
  coord: { lat: number; lon: number };
  dt: number;
  main: { humidity: number; temp: number };
  rain?: { '1h'?: number };
  snow?: { '1h'?: number };
  weather: Array<{ description: string; icon: string }>;
  wind: { deg?: number; speed: number };
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
    const apiKey = this.config.get<string>('OPENWEATHER_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Weather service is not configured');
    }

    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.set('lat', latitude.toString());
    url.searchParams.set('lon', longitude.toString());
    url.searchParams.set('units', 'metric');
    url.searchParams.set('appid', apiKey);

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    } catch {
      throw new BadGatewayException('Weather provider is unavailable');
    }

    if (!response.ok) {
      throw new BadGatewayException('Weather provider rejected the request');
    }

    const payload = (await response.json()) as OpenWeatherResponse;
    const condition = payload.weather[0];
    if (!condition) {
      throw new BadGatewayException('Weather provider returned invalid data');
    }

    return {
      latitude: payload.coord.lat,
      longitude: payload.coord.lon,
      temperature_celsius: payload.main.temp,
      condition: condition.description,
      humidity_percent: payload.main.humidity,
      wind_speed_metres_per_second: payload.wind.speed,
      wind_direction_degrees: payload.wind.deg ?? null,
      precipitation_millimetres_last_hour:
        (payload.rain?.['1h'] ?? 0) + (payload.snow?.['1h'] ?? 0),
      icon_code: condition.icon,
      observed_at: new Date(payload.dt * 1_000).toISOString(),
    };
  }
}
