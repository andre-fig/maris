import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

import type { TilesetManifest } from '../src/tiles/storage/chart-storage.js';

const DATASET = 'soundg';
const MIN_ZOOM = 8;
const MAX_ZOOM = 16;
const SAFE_VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

type GeoJsonProperties = Record<string, unknown>;
type SoundingsGeoJson = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  GeoJsonProperties
>;
type TileIndex = ReturnType<typeof geojsonvt>;
type VectorTile = NonNullable<ReturnType<TileIndex['getTile']>>;
type TileEncoder = (layers: Record<string, VectorTile>) => Uint8Array;
type Options = {
  input: string;
  publish: boolean;
  sampling: 'none' | 'legacy-v1';
  storageDirectory: string;
  version: string;
};

function parseArguments(): Options {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index]!;
    if (argument === '--') continue;
    if (argument === '--publish') {
      flags.add(argument);
      continue;
    }
    const value = process.argv[index + 1];
    if (!argument.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    values.set(argument, value);
    index += 1;
  }

  const input = values.get('--input');
  const storageDirectory = values.get('--storage-dir');
  const version = values.get('--version');
  const sampling = values.get('--sampling') ?? 'none';
  if (!input || !storageDirectory || !version) {
    throw new Error(
      'Usage: build-soundg-tiles --input <geojson> --storage-dir <dir> --version <id> [--sampling none|legacy-v1] [--publish]',
    );
  }
  if (!SAFE_VERSION.test(version)) throw new Error('Invalid version identifier');
  if (sampling !== 'none' && sampling !== 'legacy-v1') {
    throw new Error('Sampling must be none or legacy-v1');
  }

  return {
    input: path.resolve(input),
    publish: flags.has('--publish'),
    sampling,
    storageDirectory: path.resolve(storageDirectory),
    version,
  };
}

function calculateBounds(source: SoundingsGeoJson) {
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
  if (![west, south, east, north].every(Number.isFinite)) {
    throw new Error('GeoJSON has no valid point coordinates');
  }
  return [west, south, east, north] as [number, number, number, number];
}

function longitudeToTile(longitude: number, zoom: number) {
  return Math.floor(((longitude + 180) / 360) * 2 ** zoom);
}

function latitudeToTile(latitude: number, zoom: number) {
  const radians = (latitude * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * 2 ** zoom,
  );
}

function tileRange(
  bounds: [number, number, number, number],
  zoom: number,
) {
  const [west, south, east, north] = bounds;
  const limit = 2 ** zoom - 1;
  const clamp = (value: number) => Math.max(0, Math.min(limit, value));
  return {
    maxX: clamp(longitudeToTile(east, zoom) + 1),
    maxY: clamp(latitudeToTile(south, zoom) + 1),
    minX: clamp(longitudeToTile(west, zoom) - 1),
    minY: clamp(latitudeToTile(north, zoom) - 1),
  };
}

function legacySampling(tile: VectorTile, zoom: number): VectorTile {
  const sampling = zoom <= 9 ? 16 : zoom <= 10 ? 8 : zoom <= 11 ? 4 : 1;
  if (sampling === 1) return tile;

  return {
    ...tile,
    features: tile.features.filter((feature) => {
      const id = String(feature.tags?.RCID ?? feature.id ?? '0');
      let hash = 0;
      for (const character of id) {
        hash = (hash * 31 + character.charCodeAt(0)) | 0;
      }
      return Math.abs(hash) % sampling === 0;
    }),
  };
}

async function pathExists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

async function build(options: Options) {
  const source = JSON.parse(
    await readFile(options.input, 'utf8'),
  ) as SoundingsGeoJson;
  const bounds = calculateBounds(source);
  const index: TileIndex = geojsonvt(source, {
    buffer: 64,
    extent: 4096,
    indexMaxZoom: 12,
    maxZoom: MAX_ZOOM,
    tolerance: 3,
  });
  const versionsDirectory = path.join(
    options.storageDirectory,
    DATASET,
    'versions',
  );
  const destination = path.join(versionsDirectory, options.version);
  const temporaryDestination = path.join(
    versionsDirectory,
    `.${options.version}.${process.pid}.tmp`,
  );
  if (await pathExists(destination)) {
    throw new Error(
      `Version ${options.version} already exists; published artifacts are immutable`,
    );
  }

  await rm(temporaryDestination, { force: true, recursive: true });
  await mkdir(temporaryDestination, { recursive: true });
  const checksum = createHash('sha256');
  const encode = vtpbf.fromGeojsonVt as unknown as TileEncoder;
  let tileCount = 0;
  let totalBytes = 0;

  try {
    for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom += 1) {
      const range = tileRange(bounds, zoom);
      for (let x = range.minX; x <= range.maxX; x += 1) {
        for (let y = range.minY; y <= range.maxY; y += 1) {
          const indexedTile = index.getTile(zoom, x, y);
          if (!indexedTile) continue;
          const tile =
            options.sampling === 'legacy-v1'
              ? legacySampling(indexedTile, zoom)
              : indexedTile;
          if (tile.features.length === 0) continue;

          const buffer = Buffer.from(encode({ soundings: tile }));
          const relativePath = path.join(String(zoom), String(x), `${y}.pbf`);
          const outputPath = path.join(temporaryDestination, relativePath);
          await mkdir(path.dirname(outputPath), { recursive: true });
          await writeFile(outputPath, buffer, { flag: 'wx' });
          checksum.update(relativePath).update(buffer);
          tileCount += 1;
          totalBytes += buffer.byteLength;
        }
      }
    }

    const manifest: TilesetManifest & {
      artifactChecksum: string;
      sourceFeatureCount: number;
      tileCount: number;
      totalBytes: number;
    } = {
      artifactChecksum: checksum.digest('hex'),
      bounds,
      createdAt: new Date().toISOString(),
      dataset: DATASET,
      format: 'mvt',
      maxzoom: MAX_ZOOM,
      minzoom: MIN_ZOOM,
      name: 'Miami SOUNDG',
      sourceFeatureCount: source.features.length,
      tileCount,
      tilePathTemplate: `${DATASET}/versions/${options.version}/{z}/{x}/{y}.pbf`,
      totalBytes,
      vectorLayers: [
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
      version: options.version,
    };
    await writeFile(
      path.join(temporaryDestination, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    await mkdir(versionsDirectory, { recursive: true });
    await rename(temporaryDestination, destination);

    if (options.publish) {
      await writeJsonAtomic(
        path.join(options.storageDirectory, DATASET, 'active.json'),
        { dataset: DATASET, version: options.version },
      );
    }

    const outputStats = await stat(destination);
    console.log(
      JSON.stringify({
        directory: destination,
        directoryCreatedAt: outputStats.birthtime.toISOString(),
        published: options.publish,
        tileCount,
        totalBytes,
        version: options.version,
      }),
    );
  } catch (error) {
    await rm(temporaryDestination, { force: true, recursive: true });
    throw error;
  }
}

await build(parseArguments());
