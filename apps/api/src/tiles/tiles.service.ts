import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

import type { TileJsonDto } from './dtos/tile-json.dto.js';

const MIN_ZOOM = 8;
const MAX_ZOOM = 16;
const MAX_MEMORY_TILES = 1_024;

type GeoJsonProperties = Record<string, unknown>;
type SoundingsGeoJson = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  GeoJsonProperties
>;
type TileIndex = ReturnType<typeof geojsonvt>;
type VectorTile = NonNullable<ReturnType<TileIndex['getTile']>>;
type TileEncoder = (layers: Record<string, VectorTile>) => Uint8Array;

@Injectable()
export class TilesService implements OnModuleInit {
  private bounds: [number, number, number, number] = [0, 0, 0, 0];
  private index!: TileIndex;
  private readonly tileCache = new Map<string, Buffer>();
  private readonly version: string;
  private readonly sourcePath: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.version = config.getOrThrow<string>('TILESET_VERSION');
    this.sourcePath = path.resolve(
      config.getOrThrow<string>('SOUNDINGS_GEOJSON_PATH'),
    );
  }

  async onModuleInit() {
    const source = JSON.parse(
      await readFile(this.sourcePath, 'utf8'),
    ) as SoundingsGeoJson;

    this.bounds = this.calculateBounds(source);
    this.index = geojsonvt(source, {
      buffer: 64,
      extent: 4096,
      indexMaxZoom: 12,
      maxZoom: MAX_ZOOM,
      tolerance: 3,
    });
  }

  getTileJson(baseUrl: string): TileJsonDto {
    return {
      bounds: this.bounds,
      maxzoom: MAX_ZOOM,
      minzoom: MIN_ZOOM,
      name: 'Miami SOUNDG',
      scheme: 'xyz',
      tilejson: '3.0.0',
      tiles: [
        `${baseUrl}/tiles/soundg/${this.version}/{z}/{x}/{y}.pbf`,
      ],
      vector_layers: [
        {
          fields: {
            DEPTH: 'Number',
            LNAM: 'String',
            RCID: 'Number',
            SORDAT: 'String',
            SORIND: 'String',
            SOURCE_CELL: 'String',
          },
          id: 'soundings',
          maxzoom: MAX_ZOOM,
          minzoom: MIN_ZOOM,
        },
      ],
      version: this.version,
    };
  }

  getTile(version: string, z: number, x: number, y: number) {
    this.validateCoordinates(version, z, x, y);
    const key = `${version}/${z}/${x}/${y}`;
    let buffer = this.tileCache.get(key);

    if (!buffer) {
      const tile = this.index.getTile(z, x, y);
      buffer = this.encodeTile(tile, z);
      this.remember(key, buffer);
    }

    const etag = `"${createHash('sha1').update(key).digest('hex')}"`;
    return { buffer, etag };
  }

  private calculateBounds(source: SoundingsGeoJson) {
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;

    for (const feature of source.features) {
      const [longitude, latitude] = feature.geometry.coordinates;
      if (longitude === undefined || latitude === undefined) continue;
      west = Math.min(west, longitude);
      south = Math.min(south, latitude);
      east = Math.max(east, longitude);
      north = Math.max(north, latitude);
    }

    return [west, south, east, north] as [number, number, number, number];
  }

  private encodeTile(tile: VectorTile | null, zoom: number) {
    if (!tile) return Buffer.alloc(0);

    const sampling = zoom <= 9 ? 16 : zoom <= 10 ? 8 : zoom <= 11 ? 4 : 1;
    const features =
      sampling === 1
        ? tile.features
        : tile.features.filter((feature) => {
            const id = String(feature.tags?.RCID ?? feature.id ?? '0');
            let hash = 0;
            for (const character of id) {
              hash = (hash * 31 + character.charCodeAt(0)) | 0;
            }
            return Math.abs(hash) % sampling === 0;
          });

    const encode = vtpbf.fromGeojsonVt as unknown as TileEncoder;
    return Buffer.from(encode({ soundings: { ...tile, features } }));
  }

  private remember(key: string, tile: Buffer) {
    this.tileCache.set(key, tile);
    if (this.tileCache.size <= MAX_MEMORY_TILES) return;
    const oldest = this.tileCache.keys().next().value as string | undefined;
    if (oldest) this.tileCache.delete(oldest);
  }

  private validateCoordinates(
    version: string,
    z: number,
    x: number,
    y: number,
  ) {
    if (version !== this.version) {
      throw new NotFoundException('Tileset version not found');
    }
    if (!Number.isInteger(z) || z < MIN_ZOOM || z > MAX_ZOOM) {
      throw new BadRequestException(`Zoom must be between ${MIN_ZOOM} and ${MAX_ZOOM}`);
    }
    const limit = 2 ** z;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= limit ||
      y >= limit
    ) {
      throw new BadRequestException('Invalid tile coordinates');
    }
  }
}
