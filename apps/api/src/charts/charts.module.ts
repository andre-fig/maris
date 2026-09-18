import { Module } from '@nestjs/common';
import { TilesModule } from '../tiles/tiles.module.js';
import { ChartsController } from './charts.controller.js';
import { ChartsService } from './charts.service.js';

@Module({ imports: [TilesModule], controllers: [ChartsController], providers: [ChartsService] })
export class ChartsModule {}
