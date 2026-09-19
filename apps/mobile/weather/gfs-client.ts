import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  sampleGridAtCoordinate,
  type GfsBounds,
  type GfsGrid,
  type GfsPackage,
  type MapCenter,
  type SampledGfsValues,
} from './gfs-grid';
import { decodeGfsTile } from './gfs-tile-codec';
import {
  GFS_TILE_COLUMNS,
  GFS_TILE_SIZE,
  tileForCoordinate,
  tileKey,
  tilesForViewport,
  type GfsTileCoordinate,
} from './gfs-tiles';

export const GFS_FORECAST_HOURS = [0] as const;
const REQUEST_DEBOUNCE_MS = 500;
const REQUEST_TIMEOUT_MS = 15_000;
const TILE_MARGIN = 1;
const TILE_CACHE_TTL_MS = 30 * 60 * 1_000;
const CACHE_ROOT = new Directory(Paths.document, 'gfs-weather-tiles');

type CachedTile = {
  tile: GfsTileCoordinate;
  forecastHour: number;
  grid: GfsGrid;
  savedAt: number;
  source: 'cache' | 'network';
};

function validBounds(bounds: GfsBounds | null | undefined): bounds is GfsBounds {
  return Boolean(bounds) &&
    [bounds!.north, bounds!.south, bounds!.east, bounds!.west].every(Number.isFinite) &&
    bounds!.north > bounds!.south;
}

function filePrefix(tile: GfsTileCoordinate, forecastHour: number) {
  return `f${forecastHour}-x${tile.x}-y${tile.y}-`;
}

class GfsTileStore {
  private initialized = false;
  private memory = new Map<string, CachedTile>();
  private inFlight = new Map<string, Promise<CachedTile>>();

  async initialize() {
    if (this.initialized) return;
    CACHE_ROOT.create({ idempotent: true, intermediates: true });
    this.initialized = true;
  }

  async read(tile: GfsTileCoordinate, forecastHour: number): Promise<CachedTile | null> {
    await this.initialize();
    const key = tileKey(tile, forecastHour);
    const memory = this.memory.get(key);
    if (memory) return memory;
    const prefix = filePrefix(tile, forecastHour);
    const file = CACHE_ROOT.list()
      .filter((entry): entry is File =>
        entry instanceof File && entry.name.startsWith(prefix) && entry.name.endsWith('.bin'))
      .sort((left, right) => (right.modificationTime ?? 0) - (left.modificationTime ?? 0))[0];
    if (!file) return null;
    try {
      const grid = decodeGfsTile(await file.bytes());
      const cached = {
        tile, forecastHour, grid,
        savedAt: file.modificationTime ?? Date.now(),
        source: 'cache' as const,
      };
      this.memory.set(key, cached);
      return cached;
    } catch {
      return null;
    }
  }

  async fetch(apiUrl: string, tile: GfsTileCoordinate, forecastHour: number, signal?: AbortSignal) {
    const key = tileKey(tile, forecastHour);
    const cached = await this.read(tile, forecastHour);
    if (cached && Date.now() - cached.savedAt < TILE_CACHE_TTL_MS) return cached;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const promise = (async () => {
      try {
      const query = new URLSearchParams({ forecastHour: String(forecastHour) });
      const response = await fetch(
        `${apiUrl.replace(/\/$/, '')}/weather/gfs/tiles/${tile.x}/${tile.y}?${query}`,
        { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
      if (!response.ok) throw new Error(`GFS tile request failed: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const grid = decodeGfsTile(bytes);
      if (grid.width < 2 || grid.height < 2 || grid.forecastHour !== forecastHour) {
        throw new Error('Invalid GFS tile response');
      }
      await this.initialize();
      const file = new File(
        CACHE_ROOT,
        `${filePrefix(tile, forecastHour)}${grid.run.replace(/[^0-9A-Za-z]/g, '')}.bin`,
      );
      file.create({ overwrite: true, intermediates: true });
      await file.write(bytes);
      const result = { tile, forecastHour, grid, savedAt: Date.now(), source: 'network' as const };
      this.memory.set(key, result);
      return result;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}

export const gfsTileStore = new GfsTileStore();

function packageRun(run: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):/.exec(run);
  const date = match?.[1]?.replaceAll('-', '') ?? run.slice(0, 8);
  const cycle = Number(match?.[2] ?? 0);
  return { date, cycle, run, runAt: run };
}

function mergeTiles(tiles: CachedTile[], coordinate: MapCenter | null): GfsGrid | null {
  if (!tiles.length) return null;
  const centerTile = coordinate ? tileForCoordinate(coordinate[0], coordinate[1]) : tiles[0]!.tile;
  const xValues = [...new Set(tiles.map((item) => item.tile.x))].sort((a, b) => a - b);
  // A rectangular grid cannot represent the -180/180 seam. Keep the tile
  // containing the point for the native field in that special case.
  if (xValues.length > 1 && xValues[xValues.length - 1]! - xValues[0]! > GFS_TILE_COLUMNS / 2) {
    return tiles.find((item) => item.tile.x === centerTile.x && item.tile.y === centerTile.y)?.grid ?? tiles[0]!.grid;
  }
  const yValues = [...new Set(tiles.map((item) => item.tile.y))].sort((a, b) => a - b);
  const first = tiles[0]!.grid;
  const tileWidth = first.width;
  const tileHeight = first.height;
  const minX = xValues[0]!;
  const maxX = xValues[xValues.length - 1]!;
  const minY = yValues[0]!;
  const maxY = yValues[yValues.length - 1]!;
  const width = (maxX - minX) * (tileWidth - 1) + tileWidth;
  const height = (maxY - minY) * (tileHeight - 1) + tileHeight;
  const fields: GfsGrid['fields'] = {};
  for (const field of new Set(tiles.flatMap((item) => Object.keys(item.grid.fields)))) {
    const values = new Array<number | null>(width * height).fill(null);
    for (const item of tiles) {
      const source = item.grid.fields[field as keyof GfsGrid['fields']];
      if (!source) continue;
      const offsetX = (item.tile.x - minX) * (tileWidth - 1);
      const offsetY = (maxY - item.tile.y) * (tileHeight - 1);
      for (let row = 0; row < tileHeight; row += 1) {
        for (let column = 0; column < tileWidth; column += 1) {
          values[(offsetY + row) * width + offsetX + column] = source[row * tileWidth + column] ?? null;
        }
      }
    }
    fields[field as keyof GfsGrid['fields']] = values;
  }
  return {
    ...first,
    bounds: {
      west: -180 + minX * GFS_TILE_SIZE,
      east: -180 + (maxX + 1) * GFS_TILE_SIZE,
      south: -90 + minY * GFS_TILE_SIZE,
      north: -90 + (maxY + 1) * GFS_TILE_SIZE,
    },
    width,
    height,
    fields,
  };
}

function packageFromTiles(tiles: CachedTile[], coordinate: MapCenter | null): GfsPackage | null {
  if (tiles.length > 1) {
    const newestRun = [...tiles].sort((left, right) => right.savedAt - left.savedAt)[0]!.grid.run;
    tiles = tiles.filter((item) => item.grid.run === newestRun);
  }
  const grid = mergeTiles(tiles, coordinate);
  if (!grid) return null;
  return {
    model: 'gfs',
    run: packageRun(grid.run),
    resolution: grid.resolution,
    bounds: grid.bounds,
    forecastHours: [grid.forecastHour],
    availableForecastHours: [grid.forecastHour],
    grids: { [String(grid.forecastHour)]: grid },
  };
}

export async function fetchGfsTile(apiUrl: string, tile: GfsTileCoordinate, forecastHour = 0, signal?: AbortSignal) {
  return gfsTileStore.fetch(apiUrl, tile, forecastHour, signal);
}

/** Compatibility helper: fetches fixed tiles covering the requested bounds. */
export async function fetchGfsPackage(apiUrl: string, bounds: GfsBounds, signal?: AbortSignal) {
  const tiles = tilesForViewport(bounds, 0);
  const fetched = await Promise.all(tiles.map((tile) => fetchGfsTile(apiUrl, tile, 0, signal)));
  const packageData = packageFromTiles(fetched, null);
  if (!packageData) throw new Error('No GFS tiles available');
  return packageData;
}

export type GfsSample = SampledGfsValues & { forecastTime: string; forecastHour: number };

export function sampleGfsPackageAtCoordinate(packageData: GfsPackage | null | undefined, coordinate: MapCenter | null | undefined): GfsSample[] {
  if (!packageData || !coordinate) return [];
  return packageData.forecastHours.map((forecastHour) => {
    const grid = packageData.grids[String(forecastHour)];
    if (!grid) return null;
    const sampled = sampleGridAtCoordinate(grid, coordinate[1], coordinate[0]);
    return sampled ? { ...sampled, forecastTime: grid.forecastTime, forecastHour } : null;
  }).filter((sample): sample is GfsSample => sample !== null);
}

export function useGfsViewport(apiUrl: string, bounds: GfsBounds | null, coordinate: MapCenter | null, enabled = true) {
  const [packageData, setPackageData] = useState<GfsPackage | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string>();
  const [cachedAt, setCachedAt] = useState<number>();
  const request = useRef<AbortController | null>(null);
  const requestKey = useRef<string | undefined>(undefined);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const foreground = useRef(AppState.currentState === 'active');
  const coordinateRef = useRef(coordinate);
  coordinateRef.current = coordinate;

  useEffect(() => {
    if (!enabled || !validBounds(bounds) || !foreground.current) return;
    const requestedTiles = tilesForViewport(bounds, TILE_MARGIN);
    const key = requestedTiles.map((tile) => tileKey(tile, 0)).join('|');
    if (requestKey.current === key) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      debounce.current = undefined;
      void (async () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        requestKey.current = key;
        setLoading(true);
        setError(undefined);
        try {
          const result = await Promise.allSettled(requestedTiles.map((tile) => fetchGfsTile(apiUrl, tile, 0, controller.signal)));
          const loaded = result.flatMap((item) => item.status === 'fulfilled' ? [item.value] : []);
          const next = packageFromTiles(loaded, coordinateRef.current);
          const center = coordinateRef.current ? tileForCoordinate(coordinateRef.current[0], coordinateRef.current[1]) : null;
          const centerLoaded = center ? loaded.some((item) => item.tile.x === center.x && item.tile.y === center.y) : loaded.length > 0;
          if (!next || !centerLoaded) throw new Error('GFS coverage unavailable');
          setPackageData(next);
          setOffline(loaded.length > 0 && loaded.every((item) => item.source === 'cache'));
          setCachedAt(Math.max(...loaded.map((item) => item.savedAt)));
          if (loaded.length < requestedTiles.length) setError('GFS coverage incomplete');
        } catch (requestError) {
          if (!(requestError instanceof Error && requestError.name === 'AbortError')) setError('GFS unavailable');
        } finally {
          if (request.current === controller) {
            request.current = null;
            setLoading(false);
          }
        }
      })();
    }, REQUEST_DEBOUNCE_MS);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [apiUrl, bounds, enabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      if (foreground.current) requestKey.current = undefined;
    });
    return () => {
      subscription.remove();
      request.current?.abort();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  const samples = useMemo(() => sampleGfsPackageAtCoordinate(packageData, coordinate), [packageData, coordinate?.[0], coordinate?.[1]]);
  return { packageData, samples, current: samples.find((sample) => sample.forecastHour === 0), loading: enabled && loading, offline, error, cachedAt };
}
