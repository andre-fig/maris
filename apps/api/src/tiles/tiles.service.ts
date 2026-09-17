import { Inject, Injectable } from '@nestjs/common';

import type { TileJsonDto } from './dtos/tile-json.dto.js';
import {
  CHART_STORAGE,
  type ChartStorage,
} from './storage/chart-storage.js';

@Injectable()
export class TilesService {
  constructor(
    @Inject(CHART_STORAGE)
    private readonly chartStorage: ChartStorage,
  ) {}

  async getTileJson(baseUrl: string): Promise<TileJsonDto> {
    const manifest = await this.chartStorage.getActiveManifest('soundg');

    return {
      bounds: manifest.bounds,
      maxzoom: manifest.maxzoom,
      minzoom: manifest.minzoom,
      name: manifest.name,
      scheme: 'xyz',
      tilejson: '3.0.0',
      tiles: [this.chartStorage.getTileUrl(manifest, baseUrl)],
      vector_layers: manifest.vectorLayers,
      version: manifest.version,
    };
  }
}
