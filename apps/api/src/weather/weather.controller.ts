import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';

import type { CurrentWeatherDto } from './dtos/current-weather.dto.js';
import { GfsService } from './gfs.service.js';
import { GFS_FORECAST_HOURS } from './gfs.types.js';
import { WeatherService } from './weather.service.js';

@Controller('weather')
export class WeatherController {
  constructor(
    @Inject(WeatherService) private readonly weatherService: WeatherService,
    @Inject(GfsService) private readonly gfsService: GfsService,
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

  @Get('gfs')
  getGfs(
    @Query('north') northValue?: string,
    @Query('south') southValue?: string,
    @Query('east') eastValue?: string,
    @Query('west') westValue?: string,
    @Query('forecastHours') forecastHoursValue?: string,
  ) {
    const north = Number(northValue);
    const south = Number(southValue);
    const east = Number(eastValue);
    const west = Number(westValue);
    if (
      northValue === undefined || southValue === undefined || eastValue === undefined || westValue === undefined ||
      ![north, south, east, west].every(Number.isFinite)
    ) {
      throw new BadRequestException('north, south, east and west are required');
    }

    const forecastHours = forecastHoursValue
      ? forecastHoursValue.split(',').map(Number)
      : [...GFS_FORECAST_HOURS];
    return this.gfsService.getPackage({ north, south, east, west }, forecastHours);
  }
}
