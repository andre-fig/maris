import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  access,
  mkdir,
  open,
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
  sampling: 'none' | 'legacy-v1';
  storageDirectory: string;
  version: string;
};

function parseArguments(): Options {
  const values = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index]!;
    if (argument === '--') continue;
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
      'Usage: build-soundg-tiles --input <geojson> --storage-dir <dir> --version <id> [--sampling none|legacy-v1]',
    );
  }
  if (!SAFE_VERSION.test(version)) throw new Error('Invalid version identifier');
  if (sampling !== 'none' && sampling !== 'legacy-v1') {
    throw new Error('Sampling must be none or legacy-v1');
  }

  return {
    input: path.resolve(input),
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

async function build(options: Options) {
  const source = JSON.parse(
    await readFile(options.input, 'utf8'),
  ) as SoundingsGeoJson;
  const bounds = calculateBounds(source);
  const index: TileIndex = geojsonvt(source, {
    buffer: 64,
    extent: 4096,
    // Pre-indexing is unnecessary: consume each subtree once, then release it.
    indexMaxZoom: 0,
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
  const spoolPath = path.join(temporaryDestination, 'tiles.spool');
  const spool = await open(spoolPath, 'wx');

  try {
    const workingIndex = index as unknown as {
      tiles: Record<number, { features: unknown[] }>;
      tileCoords: unknown[];
    };
    // geojson-vt normally caches every generated tile. A depth-first traversal
    // needs only the current branch and its siblings, not millions of tiles.
    async function visit(zoom: number, x: number, y: number): Promise<void> {
      const id = ((2 ** zoom * y + x) * 32) + zoom;
      try {
        const indexedTile = index.getTile(zoom, x, y);
        workingIndex.tileCoords.length = 0; // debug bookkeeping only
        if (!indexedTile || indexedTile.features.length === 0) return;
        const tile = options.sampling === 'legacy-v1'
          ? legacySampling(indexedTile, zoom)
          : indexedTile;
        const range = tileRange(bounds, zoom);
        if (zoom >= MIN_ZOOM && tile.features.length > 0 &&
            x >= range.minX && x <= range.maxX && y >= range.minY && y <= range.maxY) {
          const buffer = Buffer.from(encode({ soundings: tile }));
          const frame = Buffer.alloc(16);
          [zoom, x, y, buffer.byteLength].forEach((value, offset) => frame.writeUInt32LE(value, offset * 4));
          await spool.writeFile(Buffer.concat([frame, buffer]));
          tileCount += 1;
          totalBytes += buffer.byteLength;
        }
        // Further clipping uses tile.source, not the encoded features.
        workingIndex.tiles[id]!.features = [];
        if (zoom < MAX_ZOOM) {
          for (let dx = 0; dx < 2; dx += 1) {
            for (let dy = 0; dy < 2; dy += 1) {
              await visit(zoom + 1, x * 2 + dx, y * 2 + dy);
            }
          }
        }
      } finally {
        delete workingIndex.tiles[id];
      }
    }
    await visit(0, 0, 0);

    const manifest: TilesetManifest & {
      artifactChecksum: string;
      sourceFeatureCount: number;
      tileCount: number;
      totalBytes: number;
    } = {
      artifactChecksum: '',
      bounds,
      createdAt: new Date().toISOString(),
      dataset: DATASET,
      format: 'mvt',
      storageFormat: 'pmtiles',
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
    await spool.close();
    const archive = path.join(temporaryDestination, 'tiles.pmtiles');
    await promisify(execFile)(process.env.PMTILES_PYTHON ?? 'python3', [
      fileURLToPath(new URL('./pack-pmtiles.py', import.meta.url)),
      spoolPath, archive, path.join(temporaryDestination, 'manifest.json'),
    ], { env: { ...process.env, TMPDIR: temporaryDestination }, maxBuffer: 2 * 1024 * 1024 });
    for await (const chunk of createReadStream(archive)) checksum.update(chunk);
    manifest.artifactChecksum = checksum.digest('hex');
    manifest.totalBytes = (await stat(archive)).size;
    await writeFile(path.join(temporaryDestination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await rm(spoolPath);
    await mkdir(versionsDirectory, { recursive: true });
    await rename(temporaryDestination, destination);

    const outputStats = await stat(destination);
    console.log(
      JSON.stringify({
        directory: destination,
        directoryCreatedAt: outputStats.birthtime.toISOString(),
        tileCount,
        totalBytes: manifest.totalBytes,
        uncompressedTileBytes: totalBytes,
        version: options.version,
      }),
    );
  } catch (error) {
    await spool.close().catch(() => undefined);
    await rm(temporaryDestination, { force: true, recursive: true });
    throw error;
  }
}

void build(parseArguments()).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
