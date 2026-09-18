import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessingCleanupService } from './processing-cleanup.service.js';
import { EncArchiveService } from './enc-archive.service.js';
import { coverageCells } from '../../charts/models/chart-selection.js';
import { ObjectStorageService } from '../../storage/object-storage.service.js';

import type {
  EncMetadataFeature,
  EncJsonValue,
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

  constructor(
    @Inject(ConfigService) config: ConfigService,
    @Inject(ProcessingCleanupService)
    private readonly cleanup: ProcessingCleanupService = new ProcessingCleanupService(config),
    @Inject(EncArchiveService)
    @Optional()
    protected readonly archiveService: EncArchiveService = new EncArchiveService(config),
    @Inject(ObjectStorageService)
    @Optional()
    private readonly objectStorage?: ObjectStorageService,
  ) {
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
    const extractedDirectory = path.join(workDirectory, 'cell');
    const geopackage = path.join(workDirectory, 'soundings.gpkg');
    const normalizedGeoJson = path.join(workDirectory, 'soundings.json');

    await rm(workDirectory, { force: true, recursive: true });
    await mkdir(extractedDirectory, { recursive: true });

    try {
      const archive = await this.archiveService.inspect(archivePath);
      if (archive.cells.length === 0) throw new Error('No S-57 base cells extracted');

      const cells: ProcessedCell[] = [];
      let soundingCellCount = 0;
      let geopackageCreated = false;
      const encCellsObjectPrefix = `datasets/soundg/${job.versionKey}/enc-cells/`;
      for (const entry of archive.cells.sort((a,b) => a.name.localeCompare(b.name))) {
        await rm(extractedDirectory, { force: true, recursive: true });
        await mkdir(extractedDirectory, { recursive: true });
        const files = await this.archiveService.extractCell(archivePath, entry.name, extractedDirectory);
        const cell = files.find(file => /\.000$/i.test(file));
        if (!cell) throw new Error(`Missing extracted base cell ${entry.name}`);
        const cellName = entry.name;
        const updatesApplied = entry.updateNumbers;
        const { hasSoundings, ...metadata } = await this.readCellMetadata(cell);
        // Preserve every S-57 feature class in a per-cell artifact. The
        // SOUNDG GeoPackage below remains specialized for the existing tile
        // generator, but no ENC layer is discarded and the worker never has
        // to hold a multi-gigabyte all-USA GeoPackage on its volume.
        const cellGeoPackage = path.join(extractedDirectory, `${entry.name}.gpkg`);
        await this.run('ogr2ogr', [
          '-f', 'GPKG',
          cellGeoPackage,
          cell,
          '-oo', 'SPLIT_MULTIPOINT=ON',
          '-oo', 'ADD_SOUNDG_DEPTH=ON',
          '-oo', 'UPDATES=APPLY',
        ]);
        if (this.objectStorage) {
          const cellObjectKey = `${encCellsObjectPrefix}${entry.name}.gpkg`;
          const existingCell = await this.objectStorage.tryHead(cellObjectKey);
          if (!existingCell) {
            await this.objectStorage.putFile(cellObjectKey, cellGeoPackage, 'application/geopackage+sqlite3');
          }
          const cellHead = await this.objectStorage.head(cellObjectKey);
          if (Number(cellHead.ContentLength ?? 0) <= 0) throw new Error(`Published ENC cell is empty: ${entry.name}`);
        }
        if (hasSoundings) {
          const arguments_ = [
            ...(geopackageCreated ? ['-update', '-append'] : []),
            ...(!geopackageCreated ? ['-f', 'GPKG'] : []),
            ...(geopackageCreated ? [geopackage] : [geopackage]),
            cell,
            '-oo', 'SPLIT_MULTIPOINT=ON',
            '-oo', 'ADD_SOUNDG_DEPTH=ON',
            '-oo', 'UPDATES=APPLY',
            '-dialect', 'SQLite',
            '-sql', `SELECT *, '${entry.name}' AS SOURCE_CELL FROM SOUNDG`,
            '-nln', 'soundings',
            '-dim', 'XY',
          ];
          await this.run('ogr2ogr', arguments_);
          geopackageCreated = true;
          soundingCellCount += 1;
        }
        cells.push({
          ...metadata,
          edition: metadata.edition,
          name: cellName,
          updateNumber: Math.max(metadata.updateNumber, ...updatesApplied, 0),
          updatesApplied,
        });
        // Never retain an extracted cell between batches. The source ZIP remains
        // in object storage and is reopened lazily for the next cell.
        await rm(extractedDirectory, { force: true, recursive: true });
      }

      const storagePath = path.posix.join(
        'soundg',
        'versions',
        job.versionKey,
      );
      const manifestPath = path.posix.join(storagePath, 'manifest.json');
      let existingManifest = await this.readManifestIfPresent(manifestPath);
      const remotePrefix = `datasets/soundg/${job.versionKey}`;
      if (!existingManifest && this.objectStorage) {
        const remoteManifest = await this.objectStorage.tryHead(`${remotePrefix}/manifest.json`);
        const remoteArtifact = await this.objectStorage.tryHead(`${remotePrefix}/tiles.pmtiles`);
        if (remoteManifest && remoteArtifact) {
          const localRoot = path.join(this.chartStorageDirectory, storagePath);
          await mkdir(localRoot, { recursive: true });
          await this.objectStorage.downloadToFile(`${remotePrefix}/manifest.json`, path.join(localRoot, 'manifest.json'));
          await this.objectStorage.downloadToFile(`${remotePrefix}/tiles.pmtiles`, path.join(localRoot, 'tiles.pmtiles'));
          existingManifest = await this.readManifestIfPresent(manifestPath);
        }
      }
      if (existingManifest) {
        const remote = this.objectStorage
          ? await this.publishArtifacts(job.versionKey, path.join(this.chartStorageDirectory, storagePath))
          : undefined;
        return {
          bounds: existingManifest.bounds,
          cells,
          manifestPath,
          storagePath,
          ...(remote ?? {}),
        };
      }

      if (soundingCellCount === 0) {
        throw new Error('No SOUNDG layer found in any ENC cell; no sounding tiles can be published');
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

      const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
      const scriptPath = path.join(apiRoot, 'scripts/build-soundg-tiles.ts');
      const tsxPath = path.join(apiRoot, 'node_modules/tsx/dist/cli.mjs');
      const coveragePath = path.join(workDirectory, 'coverage.json');
      await writeFile(coveragePath, JSON.stringify(coverageCells(cells)));
      await this.run(process.execPath, [
        tsxPath,
        scriptPath,
        '--input',
        normalizedGeoJson,
        '--storage-dir',
        this.chartStorageDirectory,
        '--version',
        job.versionKey,
        '--coverage',
        coveragePath,
      ]);

      const manifest = JSON.parse(
        await readFile(
          path.join(this.chartStorageDirectory, manifestPath),
          'utf8',
        ),
      ) as GeneratedManifest;

      if (this.objectStorage) {
        const localRoot = path.join(this.chartStorageDirectory, storagePath);
        const remote = await this.publishArtifacts(job.versionKey, localRoot);
        return { bounds: manifest.bounds, cells, manifestPath, storagePath, encObjectKey: encCellsObjectPrefix, ...remote };
      }

      return { bounds: manifest.bounds, cells, manifestPath, storagePath };
    } finally {
      await Promise.all([
        rm(workDirectory, { force: true, recursive: true, maxRetries: 3 }),
        this.cleanup.cleanVersion(job.versionKey),
      ]);
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

  private async publishArtifacts(versionKey: string, localRoot: string) {
    if (!this.objectStorage) return undefined;
    const artifactObjectKey = `datasets/soundg/${versionKey}/tiles.pmtiles`;
    const manifestObjectKey = `datasets/soundg/${versionKey}/manifest.json`;
    const localArtifact = path.join(localRoot, 'tiles.pmtiles');
    const expectedSize = (await stat(localArtifact)).size;
    const existingArtifact = await this.objectStorage.tryHead(artifactObjectKey);
    if (!existingArtifact || Number(existingArtifact.ContentLength ?? 0) !== expectedSize) {
      await this.objectStorage.putFile(artifactObjectKey, localArtifact, 'application/vnd.pmtiles');
    }
    if (!await this.objectStorage.tryHead(manifestObjectKey)) {
      await this.objectStorage.putFile(manifestObjectKey, path.join(localRoot, 'manifest.json'), 'application/json');
    }
    const head = await this.objectStorage.head(artifactObjectKey);
    if (Number(head.ContentLength ?? 0) !== expectedSize) throw new Error('Published PMTiles object failed validation');
    const manifestHead = await this.objectStorage.head(manifestObjectKey);
    if (Number(manifestHead.ContentLength ?? 0) <= 0) throw new Error('Published PMTiles manifest is empty');
    return { artifactObjectKey, manifestObjectKey };
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
    const readLayer = async (
      layer: string,
      keepProperties?: string[],
    ): Promise<EncMetadataFeature[]> => {
      const result = await execFileAsync('ogr2ogr', [
        '-f', 'GeoJSON', '/vsistdout/', cell, layer, '-oo', 'UPDATES=APPLY',
      ], { maxBuffer: 32 * 1024 * 1024 });
      const features = (JSON.parse(result.stdout) as { features: EncMetadataFeature[] }).features;
      if (!keepProperties) return features;

      // Metadata layers can contain very large geometries and many properties.
      // Keep only the fields consumed by the catalog so one large ENC cannot
      // retain hundreds of megabytes until the whole archive is processed.
      return features.flatMap((feature) => {
        const properties: Record<string, EncJsonValue> = {};
        for (const key of keepProperties) {
          const value = feature.properties[key];
          if (value !== undefined) properties[key] = value;
        }
        return Object.keys(properties).length > 0
          ? [{ ...feature, properties }]
          : [];
      });
    };
    const dsid = (await readLayer('DSID'))[0]?.properties;
    if (!dsid) throw new Error('Missing S-57 DSID metadata');
    const metaObjects: Record<string, EncMetadataFeature[]> = {};
    const surveyProperties = ['CATZOC', 'SORIND', 'SORDAT', 'SURSTA', 'SUREND'];
    for (const layer of layers.filter((name) => name.startsWith('M_') && name !== 'M_COVR')) {
      metaObjects[layer] = await readLayer(layer, surveyProperties);
    }
    const names = new Set<string>();
    // Geographic place names, not names of individual buoys or lights.
    for (const layer of ['SEAARE', 'LNDARE', 'FAIRWY', 'CANALS', 'HRBARE']) {
      if (!layers.includes(layer)) continue;
      for (const feature of await readLayer(layer, ['OBJNAM', 'NOBJNM'])) {
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
      coverage: layers.includes('M_COVR')
        ? await readLayer('M_COVR', ['CATCOV'])
        : [],
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
