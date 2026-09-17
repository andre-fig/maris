import { Inject, Injectable } from '@nestjs/common';

import { ChartCatalogService } from '../ingestions/services/chart-catalog.service.js';
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
    @Inject(ChartCatalogService)
    private readonly catalog: ChartCatalogService,
  ) {}

  async getTileJson(baseUrl: string): Promise<TileJsonDto> {
    const active = await this.catalog.getActiveVersion('soundg');
    if (!active) throw new Error('No published SOUNDG version');
    const manifest = await this.chartStorage.getManifest(
      'soundg',
      active.version_key,
    );

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
