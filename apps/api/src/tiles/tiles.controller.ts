import {
  Controller,
  Get,
  Inject,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import type { TileJsonDto } from './dtos/tile-json.dto.js';
import { TilesService } from './tiles.service.js';

@Controller('tiles')
export class TilesController {
  constructor(
    @Inject(TilesService) private readonly tilesService: TilesService,
  ) {}

  @Get('soundg.json')
  async getTileJson(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TileJsonDto> {
    response.set('Cache-Control', 'no-cache');
    const forwardedProtocol = request.get('x-forwarded-proto')?.split(',')[0];
    const protocol = forwardedProtocol ?? request.protocol;
    return this.tilesService.getTileJson(
      `${protocol}://${request.get('host')}`,
    );
  }
}
