import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  EncMetadataFeature,
  ProcessedCell,
  ProcessingJob,
  ProcessingResult,
} from '../models/processing.js';

const execFileAsync = promisify(execFile);

type GeneratedManifest = {
  bounds: [number, number, number, number];
};

@Injectable()
export class EncProcessingService {
  private readonly chartStorageDirectory: string;
  private readonly storageDirectory: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.storageDirectory = path.resolve(
      config.getOrThrow<string>('STORAGE_DIR'),
    );
    this.chartStorageDirectory = path.resolve(
      config.getOrThrow<string>('CHART_STORAGE_DIR'),
    );
  }

  async process(job: ProcessingJob): Promise<ProcessingResult> {
    const archivePath = path.join(this.storageDirectory, job.archivePath);
    const workDirectory = path.join(
      this.storageDirectory,
      '.processing',
      job.ingestionId,
    );
    const extractedDirectory = path.join(workDirectory, 'source');
    const geopackage = path.join(workDirectory, 'soundings.gpkg');
    const normalizedGeoJson = path.join(workDirectory, 'soundings.json');

    await rm(workDirectory, { force: true, recursive: true });
    await mkdir(extractedDirectory, { recursive: true });

    try {
      await this.run('unzip', ['-q', archivePath, '-d', extractedDirectory]);
      const baseCells = (await this.findFiles(extractedDirectory)).filter(
        (file) => /\.000$/i.test(file),
      );
      if (baseCells.length === 0) throw new Error('No S-57 base cells extracted');

      const cells: ProcessedCell[] = [];
      const soundingCells: string[] = [];
      for (const cell of baseCells.sort()) {
        const cellName = path.basename(cell, '.000').toUpperCase();
        const updatesApplied = await this.findUpdates(cell);
        const { hasSoundings, ...metadata } = await this.readCellMetadata(cell);
        if (hasSoundings) soundingCells.push(cell);
        cells.push({
          ...metadata,
          edition: metadata.edition,
          name: cellName,
          updateNumber: Math.max(metadata.updateNumber, ...updatesApplied, 0),
          updatesApplied,
        });
      }

      const storagePath = path.posix.join(
        'soundg',
        'versions',
        job.versionKey,
      );
      const manifestPath = path.posix.join(storagePath, 'manifest.json');
      const existingManifest = await this.readManifestIfPresent(manifestPath);
      if (existingManifest) {
        return {
          bounds: existingManifest.bounds,
          cells,
          manifestPath,
          storagePath,
        };
      }

      if (soundingCells.length === 0) {
        throw new Error('No SOUNDG layer found in any ENC cell; no sounding tiles can be published');
      }
      for (const [index, cell] of soundingCells.entries()) {
        const cellName = path.basename(cell, '.000').toUpperCase();
        const arguments_ = [
          ...(index === 0 ? [] : ['-update', '-append']),
          ...(index === 0 ? ['-f', 'GPKG'] : []),
          geopackage,
          cell,
          '-oo',
          'SPLIT_MULTIPOINT=ON',
          '-oo',
          'ADD_SOUNDG_DEPTH=ON',
          '-oo',
          'UPDATES=APPLY',
          '-dialect',
          'SQLite',
          '-sql',
          `SELECT *, '${cellName}' AS SOURCE_CELL FROM SOUNDG`,
          '-nln',
          'soundings',
          '-dim',
          'XY',
        ];
        await this.run('ogr2ogr', arguments_);
      }

      await this.run('ogr2ogr', [
        '-f',
        'GeoJSON',
        normalizedGeoJson,
        geopackage,
        'soundings',
        '-dim',
        'XY',
        '-select',
        'DEPTH,RCID,LNAM,SORDAT,SORIND,SOURCE_CELL',
        '-lco',
        'RFC7946=YES',
        '-lco',
        'COORDINATE_PRECISION=6',
      ]);

      const scriptPath = path.resolve(
        process.cwd(),
        'apps/api/scripts/build-soundg-tiles.ts',
      );
      const tsxPath = path.resolve(
        process.cwd(),
        'apps/api/node_modules/tsx/dist/cli.mjs',
      );
      await this.run(process.execPath, [
        tsxPath,
        scriptPath,
        '--input',
        normalizedGeoJson,
        '--storage-dir',
        this.chartStorageDirectory,
        '--version',
        job.versionKey,
      ]);

      const manifest = JSON.parse(
        await readFile(
          path.join(this.chartStorageDirectory, manifestPath),
          'utf8',
        ),
      ) as GeneratedManifest;

      return { bounds: manifest.bounds, cells, manifestPath, storagePath };
    } finally {
      await rm(workDirectory, { force: true, recursive: true });
    }
  }

  private async readManifestIfPresent(manifestPath: string) {
    try {
      return JSON.parse(
        await readFile(
          path.join(this.chartStorageDirectory, manifestPath),
          'utf8',
        ),
      ) as GeneratedManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private async findFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await this.findFiles(entryPath)));
      else if (entry.isFile()) files.push(entryPath);
    }
    return files;
  }

  private async findUpdates(baseCell: string) {
    const directory = path.dirname(baseCell);
    const name = path.basename(baseCell, '.000');
    const entries = await readdir(directory);
    return entries
      .map((entry) => new RegExp(`^${name}\\.(\\d{3})$`, 'i').exec(entry))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => Number(match[1]))
      .filter((update) => update > 0)
      .sort((left, right) => left - right);
  }

  async readCellMetadata(cell: string) {
    const { stdout } = await execFileAsync('ogrinfo',
      ['-ro', '-so', '-oo', 'UPDATES=APPLY', cell],
      { maxBuffer: 2 * 1024 * 1024 });
    const layers = [...stdout.matchAll(/^\d+: (\w+)/gm)].map((match) => match[1]!);
    const readLayer = async (layer: string): Promise<EncMetadataFeature[]> => {
      const result = await execFileAsync('ogr2ogr', [
        '-f', 'GeoJSON', '/vsistdout/', cell, layer, '-oo', 'UPDATES=APPLY',
      ], { maxBuffer: 32 * 1024 * 1024 });
      return (JSON.parse(result.stdout) as { features: EncMetadataFeature[] }).features;
    };
    const dsid = (await readLayer('DSID'))[0]?.properties;
    if (!dsid) throw new Error('Missing S-57 DSID metadata');
    const metaObjects: Record<string, EncMetadataFeature[]> = {};
    for (const layer of layers.filter((name) => name.startsWith('M_'))) {
      metaObjects[layer] = await readLayer(layer);
    }
    const names = new Set<string>();
    // Geographic place names, not names of individual buoys or lights.
    for (const layer of ['SEAARE', 'LNDARE', 'FAIRWY', 'CANALS', 'HRBARE']) {
      if (!layers.includes(layer)) continue;
      for (const feature of await readLayer(layer)) {
        for (const key of ['OBJNAM', 'NOBJNM']) {
          const value = feature.properties[key];
          if (typeof value === 'string' && value.trim()) names.add(value.trim());
        }
      }
    }
    const number = (key: string): number | null => {
      const value = dsid[key];
      return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
        ? Number(value) : null;
    };
    const date = (key: string): string | null => {
      const value = String(dsid[key] ?? '');
      if (!/^\d{8}$/.test(value)) return null;
      const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
      const parsed = new Date(iso);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
    };
    const agencyCode = number('DSID_AGEN');
    return {
      hasSoundings: layers.includes('SOUNDG'),
      edition: dsid.DSID_EDTN == null ? null : String(dsid.DSID_EDTN),
      updateNumber: number('DSID_UPDN') ?? 0,
      metadata: {
        source: agencyCode === 550 ? 'NOAA' : null,
        agencyCode,
        issueDate: date('DSID_ISDT'),
        updateApplicationDate: date('DSID_UADT'),
        compilationScale: number('DSPM_CSCL'),
        horizontalDatum: number('DSPM_HDAT'),
        verticalDatum: number('DSPM_VDAT'),
        soundingDatum: number('DSPM_SDAT'),
        coveredAreaNames: [...names].sort(),
        coverage: metaObjects.M_COVR ?? [],
        metaObjects,
        rawDatasetIdentification: dsid,
      },
    };
  }

  protected async run(command: string, arguments_: string[]) {
    try {
      await execFileAsync(command, arguments_, { maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
      const failure = error as Error & { stderr?: string };
      throw new Error(
        `${command} failed: ${failure.stderr?.trim() || failure.message}`,
        { cause: error },
      );
    }
  }
}
