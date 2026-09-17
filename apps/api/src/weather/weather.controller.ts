import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';

import type { CurrentWeatherDto } from './dtos/current-weather.dto.js';
import { WeatherService } from './weather.service.js';

@Controller('weather')
export class WeatherController {
  constructor(
    @Inject(WeatherService) private readonly weatherService: WeatherService,
  ) {}

  @Get('current')
  getCurrentWeather(
    @Query('lat') latitudeValue?: string,
    @Query('lon') longitudeValue?: string,
  ): Promise<CurrentWeatherDto> {
    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);

    if (
      latitudeValue === undefined ||
      longitudeValue === undefined ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Invalid latitude or longitude');
    }

    return this.weatherService.getCurrentWeather(latitude, longitude);
  }
}
