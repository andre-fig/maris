import { Module } from '@nestjs/common';

import { WeatherController } from './weather.controller.js';
import { WeatherService } from './weather.service.js';
import { GfsService } from './gfs.service.js';

@Module({
  controllers: [WeatherController],
  providers: [WeatherService, GfsService],
  exports: [GfsService],
})
export class WeatherModule {}
