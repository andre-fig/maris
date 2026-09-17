import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ChartStorage, TilesetManifest } from './chart-storage.js';

type ActiveVersion = {
  dataset: string;
  version: string;
};

const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

@Injectable()
export class LocalChartStorageService implements ChartStorage {
  private readonly publicBaseUrl: string | undefined;
  private readonly storageDirectory: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.storageDirectory = path.resolve(
      config.getOrThrow<string>('CHART_STORAGE_DIR'),
    );
    this.publicBaseUrl = config.get<string>('CHART_ASSET_BASE_URL')?.replace(
      /\/$/,
      '',
    );
  }

  async getActiveManifest(dataset: string): Promise<TilesetManifest> {
    this.assertSafeSegment(dataset);

    try {
      const active = await this.readJson<ActiveVersion>(
        path.join(this.storageDirectory, dataset, 'active.json'),
      );
      this.assertSafeSegment(active.version);

      const manifest = await this.readJson<TilesetManifest>(
        path.join(
          this.storageDirectory,
          dataset,
          'versions',
          active.version,
          'manifest.json',
        ),
      );

      if (
        active.dataset !== dataset ||
        manifest.dataset !== dataset ||
        manifest.version !== active.version
      ) {
        throw new InternalServerErrorException(
          `Invalid active manifest for ${dataset}`,
        );
      }
      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`No published dataset named ${dataset}`);
      }
      throw error;
    }
  }

  getTileUrl(manifest: TilesetManifest, fallbackBaseUrl: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${manifest.tilePathTemplate}`;
    }

    // Nginx maps this compatibility URL directly to CHART_STORAGE_DIR.
    return `${fallbackBaseUrl}/tiles/${manifest.dataset}/${manifest.version}/{z}/{x}/{y}.pbf`;
  }

  private async readJson<T>(filePath: string): Promise<T> {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  }

  private assertSafeSegment(value: string) {
    if (!SAFE_SEGMENT.test(value)) {
      throw new InternalServerErrorException('Invalid chart storage key');
    }
  }
}
