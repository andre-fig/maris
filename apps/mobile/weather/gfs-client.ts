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

export const GFS_FORECAST_HOURS = [0] as const;
const REQUEST_DEBOUNCE_MS = 900;
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_ROOT = new Directory(Paths.document, 'gfs-weather');

type CachedPackage = {
  savedAt: number;
  package: GfsPackage;
};

function validBounds(bounds: GfsBounds | null | undefined): bounds is GfsBounds {
  return Boolean(bounds) && [
    bounds!.north, bounds!.south, bounds!.east, bounds!.west,
  ].every(Number.isFinite) && bounds!.north > bounds!.south;
}

function containsBounds(container: GfsBounds, requested: GfsBounds) {
  return container.west <= requested.west &&
    container.east >= requested.east &&
    container.south <= requested.south &&
    container.north >= requested.north;
}

function containsCoordinate(bounds: GfsBounds, coordinate: MapCenter) {
  return coordinate[1] >= bounds.south && coordinate[1] <= bounds.north &&
    coordinate[0] >= bounds.west && coordinate[0] <= bounds.east;
}

export function quantizeGfsBounds(bounds: GfsBounds): GfsBounds {
  const quantum = 0.25;
  return {
    west: Math.floor(bounds.west / quantum) * quantum,
    south: Math.floor(bounds.south / quantum) * quantum,
    east: Math.ceil(bounds.east / quantum) * quantum,
    north: Math.ceil(bounds.north / quantum) * quantum,
  };
}

function hasForecastHours(packageData: GfsPackage, hours: readonly number[]) {
  return hours.every((hour) => Boolean(packageData.grids[String(hour)]));
}

class GfsCache {
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    CACHE_ROOT.create({ idempotent: true, intermediates: true });
    this.initialized = true;
  }

  async readAll(): Promise<CachedPackage[]> {
    await this.initialize();
    return (await Promise.all(CACHE_ROOT.list()
      .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.json'))
      .map(async (file) => {
        try {
          return JSON.parse(await file.text()) as CachedPackage;
        } catch {
          return null;
        }
      }))).filter((entry): entry is CachedPackage => entry !== null);
  }

  async find(bounds: GfsBounds | null, coordinate: MapCenter, hours: readonly number[]) {
    const entries = await this.readAll();
    return entries
      .sort((a, b) => b.savedAt - a.savedAt)
      .find((entry) => hasForecastHours(entry.package, hours) &&
        (validBounds(bounds)
          ? containsBounds(entry.package.bounds, bounds)
          : containsCoordinate(entry.package.bounds, coordinate))) ?? null;
  }

  async save(packageData: GfsPackage) {
    await this.initialize();
    const key = `${packageData.run.run.replace(/[^0-9]/g, '')}-${packageData.bounds.west}-${packageData.bounds.south}-${packageData.bounds.east}-${packageData.bounds.north}`;
    const file = new File(CACHE_ROOT, `${key}.json`);
    file.create({ overwrite: true, intermediates: true });
    file.write(JSON.stringify({ savedAt: Date.now(), package: packageData } satisfies CachedPackage));
  }
}

export const gfsCache = new GfsCache();

export async function fetchGfsPackage(
  apiUrl: string,
  bounds: GfsBounds,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    north: String(bounds.north),
    south: String(bounds.south),
    east: String(bounds.east),
    west: String(bounds.west),
    forecastHours: GFS_FORECAST_HOURS.join(','),
  });
  const response = await fetch(`${apiUrl}/weather/gfs?${query}`, {
    signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GFS request failed: ${response.status}`);
  const packageData = (await response.json()) as GfsPackage;
  if (!packageData?.grids || !packageData.run?.runAt) throw new Error('Invalid GFS package');
  await gfsCache.save(packageData);
  return packageData;
}

export type GfsSample = SampledGfsValues & {
  forecastTime: string;
  forecastHour: number;
};

export function sampleGfsPackageAtCoordinate(
  packageData: GfsPackage | null | undefined,
  coordinate: MapCenter | null | undefined,
): GfsSample[] {
  if (!packageData || !coordinate) return [];
  return packageData.forecastHours
    .map((forecastHour) => {
      const grid = packageData.grids[String(forecastHour)];
      if (!grid) return null;
      const sampled = sampleGridAtCoordinate(grid, coordinate[1], coordinate[0]);
      return sampled
        ? { ...sampled, forecastTime: grid.forecastTime, forecastHour }
        : null;
    })
    .filter((sample): sample is GfsSample => sample !== null);
}

export function useGfsViewport(
  apiUrl: string,
  bounds: GfsBounds | null,
  coordinate: MapCenter | null,
  enabled = true,
) {
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
    let active = true;
    void gfsCache.find(bounds, coordinate ?? [0, 0], GFS_FORECAST_HOURS).then((cached) => {
      if (!active || !cached) return;
      setPackageData(cached.package);
      setLoading(false);
      setOffline(true);
      setError(undefined);
      setCachedAt(cached.savedAt);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !validBounds(bounds) || !foreground.current) return;
    const cacheBounds = quantizeGfsBounds(bounds);
    const key = JSON.stringify(cacheBounds);
    if (requestKey.current === key) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      debounce.current = undefined;
      void (async () => {
        const cached = await gfsCache.find(cacheBounds, coordinateRef.current ?? [0, 0], GFS_FORECAST_HOURS);
        if (cached) {
          setPackageData(cached.package);
          setLoading(false);
          setOffline(true);
          setError(undefined);
          setCachedAt(cached.savedAt);
          requestKey.current = key;
          return;
        }
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        requestKey.current = key;
        setLoading(true);
        setOffline(false);
        try {
          const next = await fetchGfsPackage(apiUrl, cacheBounds, controller.signal);
          setPackageData(next);
          setOffline(false);
          setError(undefined);
          setCachedAt(Date.now());
        } catch (requestError) {
          if (!(requestError instanceof Error && requestError.name === 'AbortError')) {
            const stale = await gfsCache.find(null, coordinateRef.current ?? [0, 0], GFS_FORECAST_HOURS);
            if (stale) {
              setPackageData(stale.package);
              setOffline(true);
              setCachedAt(stale.savedAt);
            }
            setError('GFS unavailable');
          }
        } finally {
          if (request.current === controller) request.current = null;
          setLoading(false);
        }
      })();
    }, REQUEST_DEBOUNCE_MS);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [apiUrl, bounds, enabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      if (foreground.current && validBounds(bounds)) requestKey.current = undefined;
    });
    return () => {
      subscription.remove();
      request.current?.abort();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [bounds]);

  const samples = useMemo(
    () => sampleGfsPackageAtCoordinate(packageData, coordinate),
    [packageData, coordinate?.[0], coordinate?.[1]],
  );

  return {
    packageData,
    samples,
    current: samples.find((sample) => sample.forecastHour === 0),
    loading: enabled && loading,
    offline,
    error,
    cachedAt,
  };
}
