import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  GFS_FORECAST_HOURS,
  type GfsBounds,
  type GfsGrid,
  type GfsPackage,
  type GfsRun,
} from './gfs.types.js';

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const NOMADS_FILTER_URL = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl';
const NOMADS_TIMEOUT_MS = 30_000;
const RESOLUTION = 0.25;

type Inventory = {
  run: GfsRun;
  files: Set<string>;
};

type ParsedSubset = {
  metadata: {
    width: number;
    height: number;
    iScansNegatively: boolean;
    jScansPositively: boolean;
  };
  fields: Record<string, Array<number | null>>;
};

@Injectable()
export class GfsService {
  constructor(private readonly config: ConfigService) {}

  async getPackage(bounds: GfsBounds, requestedHours: number[] = [...GFS_FORECAST_HOURS]): Promise<GfsPackage> {
    const normalizedBounds = this.normalizeBounds(bounds);
    const forecastHours = this.normalizeForecastHours(requestedHours);
    const inventory = await this.findCompleteInventory(forecastHours);
    const grids: Record<string, GfsGrid> = {};

    for (const forecastHour of forecastHours) {
      const file = this.fileForHour(inventory.files, forecastHour);
      if (!file) {
        throw new ServiceUnavailableException(`GFS forecast hour ${forecastHour} is unavailable`);
      }
      grids[String(forecastHour)] = await this.getGrid(
        inventory.run,
        file,
        forecastHour,
        normalizedBounds,
      );
    }

    return {
      model: 'gfs',
      run: inventory.run,
      resolution: RESOLUTION,
      bounds: normalizedBounds,
      forecastHours,
      availableForecastHours: forecastHours,
      grids,
    };
  }

  private normalizeForecastHours(hours: number[]) {
    const normalized = [...new Set(hours)].filter(
      (hour) => Number.isInteger(hour) && hour >= 0 && hour <= 384,
    ).sort((a, b) => a - b);
    if (normalized.length === 0) throw new BadRequestException('At least one valid forecast hour is required');
    return normalized;
  }

  private normalizeBounds(bounds: GfsBounds): GfsBounds {
    const { north, south, east, west } = bounds;
    if (![north, south, east, west].every(Number.isFinite)) {
      throw new BadRequestException('Invalid GFS bounding box');
    }
    if (north < -90 || north > 90 || south < -90 || south > 90 || north <= south) {
      throw new BadRequestException('Invalid GFS latitude bounds');
    }
    if (west < -180 || west > 180 || east < -180 || east > 180 || east === west) {
      throw new BadRequestException('Invalid GFS longitude bounds');
    }

    const span = east >= west ? east - west : east + 360 - west;
    const gfsWest = this.toGfsLongitude(west);
    const gfsEast = gfsWest + span;
    if (gfsEast > 360) {
      throw new BadRequestException(
        'GFS bounding boxes spanning the 0/360 seam are not supported by one subset request',
      );
    }

    return { north, south, east, west };
  }

  private toGfsLongitude(longitude: number) {
    return longitude < 0 ? longitude + 360 : longitude;
  }

  private async findCompleteInventory(forecastHours: number[]): Promise<Inventory> {
    const now = new Date();
    for (let dayOffset = 0; dayOffset <= 3; dayOffset += 1) {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() - dayOffset);
      const dateText = date.toISOString().slice(0, 10).replaceAll('-', '');
      for (const cycle of [18, 12, 6, 0]) {
        const runDate = new Date(`${dateText.slice(0, 4)}-${dateText.slice(4, 6)}-${dateText.slice(6)}T${String(cycle).padStart(2, '0')}:00:00Z`);
        if (runDate.getTime() > now.getTime() + 6 * 60 * 60 * 1_000) continue;
        const inventory = await this.readInventory(dateText, cycle);
        if (inventory && forecastHours.every((hour) => this.fileForHour(inventory.files, hour))) {
          return inventory;
        }
      }
    }
    throw new ServiceUnavailableException('No complete GFS run is currently available');
  }

  private async readInventory(date: string, cycle: number): Promise<Inventory | null> {
    const directory = `/gfs.${date}/${String(cycle).padStart(2, '0')}/atmos`;
    const url = new URL(NOMADS_FILTER_URL);
    url.searchParams.set('dir', directory);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(NOMADS_TIMEOUT_MS) });
      if (!response.ok) return null;
      const html = await response.text();
      const files = new Set<string>();
      for (const match of html.matchAll(/value="(gfs\.t\d{2}z\.pgrb2\.0p25\.(?:anl|f\d{3}))"/g)) {
        if (match[1]) files.add(match[1]);
      }
      if (files.size === 0) return null;
      return {
        files,
        run: {
          date,
          cycle,
          run: `${date}T${String(cycle).padStart(2, '0')}:00:00Z`,
          runAt: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T${String(cycle).padStart(2, '0')}:00:00Z`,
        },
      };
    } catch {
      return null;
    }
  }

  private fileForHour(files: Set<string>, hour: number) {
    if (hour === 0) {
      return [...files].find((file) => file.endsWith('.anl')) ??
        [...files].find((file) => file.endsWith('.f000'));
    }
    return [...files].find((file) => file.endsWith(`.f${String(hour).padStart(3, '0')}`));
  }

  private async getGrid(
    run: GfsRun,
    file: string,
    forecastHour: number,
    bounds: GfsBounds,
  ): Promise<GfsGrid> {
    const cachePath = this.cachePath(run, forecastHour, file, bounds);
    try {
      return JSON.parse((await gunzipAsync(await readFile(cachePath))).toString('utf8')) as GfsGrid;
    } catch {
      // Cache miss; fetch and validate the source below.
    }

    const grib = await this.downloadSubset(run, file, bounds);
    const parsed = await this.parseGrib(grib);
    const grid = this.normalizeGrid(run, forecastHour, parsed, bounds);
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, await gzipAsync(JSON.stringify(grid), { level: 6 }));
    return grid;
  }

  private async downloadSubset(run: GfsRun, file: string, bounds: GfsBounds) {
    const url = new URL(NOMADS_FILTER_URL);
    url.searchParams.set('file', file);
    for (const variable of ['UGRD', 'VGRD', 'TMP', 'APCP', 'PRATE', 'TCDC', 'PRMSL', 'GUST', 'RH']) {
      url.searchParams.set(`var_${variable}`, 'on');
    }
    for (const level of [
      '10_m_above_ground',
      '2_m_above_ground',
      'surface',
      'entire_atmosphere',
      'mean_sea_level',
    ]) {
      url.searchParams.set(`lev_${level}`, 'on');
    }
    url.searchParams.set('subregion', '');
    url.searchParams.set('leftlon', String(this.toGfsLongitude(bounds.west)));
    url.searchParams.set('rightlon', String(this.toGfsLongitude(bounds.east)));
    url.searchParams.set('toplat', String(bounds.north));
    url.searchParams.set('bottomlat', String(bounds.south));
    url.searchParams.set('dir', `/gfs.${run.date}/${String(run.cycle).padStart(2, '0')}/atmos`);

    const response = await fetch(url, { signal: AbortSignal.timeout(NOMADS_TIMEOUT_MS) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || bytes.length < 16 || String.fromCharCode(...bytes.slice(0, 4)) !== 'GRIB') {
      throw new BadGatewayException('NOMADS returned an invalid GFS GRIB2 subset');
    }
    return bytes;
  }

  private async parseGrib(bytes: Uint8Array): Promise<ParsedSubset> {
    const parser = this.config.get<string>('GFS_PARSER_PYTHON', 'python3');
    const configuredScript = this.config.get<string>(
      'GFS_PARSER_SCRIPT',
      'apps/api/scripts/gfs-grib-parser.py',
    );
    const scriptCandidates = [
      configuredScript,
      path.resolve(process.cwd(), configuredScript),
      path.resolve(process.cwd(), 'apps/api/scripts/gfs-grib-parser.py'),
      path.resolve(process.cwd(), 'scripts/gfs-grib-parser.py'),
      path.resolve(process.cwd(), '..', '..', 'apps/api/scripts/gfs-grib-parser.py'),
    ];
    const parserScript = scriptCandidates.find((candidate) => existsSync(candidate));
    if (!parserScript) {
      throw new ServiceUnavailableException('GFS GRIB2 parser script is unavailable');
    }
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'maris-gfs-'));
    const temporaryFile = path.join(temporaryDirectory, 'subset.grib2');
    await writeFile(temporaryFile, bytes);
    try {
      const { stdout } = await execFileAsync(
        parser,
        [parserScript, temporaryFile],
        { maxBuffer: 128 * 1024 * 1024 },
      );
      return JSON.parse(stdout) as ParsedSubset;
    } catch {
      throw new ServiceUnavailableException('GRIB2 parser is unavailable or rejected the GFS subset');
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private normalizeGrid(
    run: GfsRun,
    forecastHour: number,
    parsed: ParsedSubset,
    bounds: GfsBounds,
  ): GfsGrid {
    const { width, height, iScansNegatively, jScansPositively } = parsed.metadata;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new BadGatewayException('GFS subset has invalid grid dimensions');
    }
    const fields: GfsGrid['fields'] = {};
    for (const [name, values] of Object.entries(parsed.fields)) {
      if (values.length !== width * height) continue;
      const normalized = new Array<number | null>(values.length);
      for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
          const sourceRow = jScansPositively ? height - 1 - row : row;
          const sourceColumn = iScansNegatively ? width - 1 - column : column;
          const value = values[sourceRow * width + sourceColumn];
          normalized[row * width + column] = value ?? null;
        }
      }
      fields[name as keyof GfsGrid['fields']] = normalized;
    }
    if (!fields.windU || !fields.windV || !fields.temperature) {
      throw new BadGatewayException('GFS subset is missing required fields');
    }

    const forecastTime = new Date(Date.parse(run.runAt) + forecastHour * 60 * 60 * 1_000).toISOString();
    return {
      model: 'gfs',
      run: run.runAt,
      forecastTime,
      forecastHour,
      resolution: RESOLUTION,
      bounds,
      width,
      height,
      gridOrder: 'north-to-south,west-to-east',
      longitudeConvention: '-180..180',
      units: {
        wind: 'm/s',
        temperature: 'K',
        precipitation: 'kg/m2',
        precipitationRate: 'kg/m2/s',
        cloudCover: '%',
        pressure: 'Pa',
        gust: 'm/s',
        humidity: '%',
      },
      fields,
    };
  }

  private cachePath(run: GfsRun, forecastHour: number, file: string, bounds: GfsBounds) {
    const key = createHash('sha256')
      .update(JSON.stringify({ run, forecastHour, file, bounds, resolution: RESOLUTION }))
      .digest('hex');
    return path.join(
      this.config.get<string>('GFS_CACHE_DIR', '.storage/gfs'),
      `${run.date}${String(run.cycle).padStart(2, '0')}`,
      `f${String(forecastHour).padStart(3, '0')}-${key}.json.gz`,
    );
  }
}
