import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Req,
  Res,
  StreamableFile,
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
  getTileJson(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): TileJsonDto {
    response.set('Cache-Control', 'no-cache');
    const forwardedProtocol = request.get('x-forwarded-proto')?.split(',')[0];
    const protocol = forwardedProtocol ?? request.protocol;
    return this.tilesService.getTileJson(
      `${protocol}://${request.get('host')}`,
    );
  }

  @Get('soundg/:version/:z/:x/:file')
  @HttpCode(200)
  getTile(
    @Param('version') version: string,
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('file') file: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): StreamableFile | void {
    const match = /^(\d+)\.pbf$/.exec(file);
    if (!match) throw new NotFoundException('Tile not found');

    const y = Number(match[1]);
    const tile = this.tilesService.getTile(version, z, x, y);
    if (ifNoneMatch === tile.etag) {
      response.status(304);
      return;
    }

    response.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Encoding': 'identity',
      'Content-Type': 'application/vnd.mapbox-vector-tile',
      ETag: tile.etag,
    });
    return new StreamableFile(tile.buffer);
  }
}
