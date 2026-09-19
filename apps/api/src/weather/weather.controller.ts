import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { GfsService } from './gfs.service.js';
import { GFS_FORECAST_HOURS } from './gfs.types.js';

@Controller('weather')
export class WeatherController {
  constructor(private readonly gfsService: GfsService) {}

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
