import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import {
  API_CONFIG,
  type ApiConfig,
} from '../../configuration/api-config.js';
import type { IngestionManifest } from '../domain/ingestion.js';

@Injectable()
export class ManifestRepository {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async findById(id: string): Promise<IngestionManifest | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return null;
    }

    try {
      return JSON.parse(
        await readFile(this.manifestPath(id), 'utf8'),
      ) as IngestionManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(manifest: IngestionManifest) {
    await writeFile(
      this.manifestPath(manifest.id),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
  }

  private manifestPath(id: string) {
    return path.join(
      this.config.storageDirectory,
      'ingestions',
      id,
      'manifest.json',
    );
  }
}
