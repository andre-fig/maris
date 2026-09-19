import { BadRequestException, Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { GfsService } from './gfs.service.js';
import { GFS_FORECAST_HOURS } from './gfs.types.js';

const GFS_SUCCESS_CACHE_CONTROL =
  'public, s-maxage=1800, stale-while-revalidate=300';

@Controller('weather')
export class WeatherController {
  constructor(@Inject(GfsService) private readonly gfsService: GfsService) {}

  @Get('gfs')
  async getGfs(
    @Query('north') northValue?: string,
    @Query('south') southValue?: string,
    @Query('east') eastValue?: string,
    @Query('west') westValue?: string,
    @Query('forecastHours') forecastHoursValue?: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    // Errors must never be retained by a shared CDN. This is set before
    // validation and remains in place if the service throws an exception.
    response?.set('Cache-Control', 'no-store');
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
    const result = await this.gfsService.getPackage(
      { north, south, east, west },
      forecastHours,
    );
    response?.set('Cache-Control', GFS_SUCCESS_CACHE_CONTROL);
    return result;
  }
}
