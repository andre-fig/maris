import type { GfsBounds, GfsGrid, MapCenter } from "./gfs-grid";

export const GFS_MAX_WEATHER_ZOOM = 6;
export const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
export type GfsTileCoordinate = { z: number; x: number; y: number };

export function assertValidZoom(z: number) {
  if (!Number.isInteger(z) || z < 0 || z > GFS_MAX_WEATHER_ZOOM) {
    throw new RangeError("Invalid GFS weather zoom");
  }
}

function assertFiniteCoordinate(longitude: number, latitude: number) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new RangeError("Invalid GFS coordinate");
  }
}

function assertValidMargin(margin: number) {
  if (!Number.isInteger(margin) || margin < 0) {
    throw new RangeError("Invalid GFS viewport margin");
  }
}

export function tileBounds({ z, x, y }: GfsTileCoordinate): GfsBounds {
  const n = 2 ** z;
  assertValidZoom(z);
  if (!Number.isInteger(x) || x < 0 || x >= n || !Number.isInteger(y) || y < 0 || y >= n) throw new RangeError("Invalid GFS tile coordinate");
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const latitude = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
  return { west, east, south: latitude(y + 1), north: latitude(y) };
}

export function tileForCoordinate(longitude: number, latitude: number, z: number): GfsTileCoordinate {
  assertValidZoom(z);
  assertFiniteCoordinate(longitude, latitude);
  const n = 2 ** z;
  const normalizedLongitude = ((((longitude + 180) % 360) + 360) % 360) - 180;
  const clampedLatitude = Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude));
  const phi = (clampedLatitude * Math.PI) / 180;
  return { z, x: Math.floor(((normalizedLongitude + 180) / 360) * n), y: Math.max(0, Math.min(n - 1, Math.floor(((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * n))) };
}

function longitudeBands(bounds: GfsBounds) {
  return bounds.west <= bounds.east ? [[bounds.west, bounds.east]] : [[bounds.west, 180], [-180, bounds.east]];
}

export function tilesForViewport(bounds: GfsBounds, z: number, margin = 1): GfsTileCoordinate[] {
  assertValidZoom(z);
  assertValidMargin(margin);
  if (!Number.isFinite(bounds.north) || !Number.isFinite(bounds.south) || !Number.isFinite(bounds.east) || !Number.isFinite(bounds.west) || bounds.north < bounds.south) return [];
  const n = 2 ** z;
  const south = Math.max(-WEB_MERCATOR_MAX_LATITUDE, bounds.south);
  const north = Math.min(WEB_MERCATOR_MAX_LATITUDE, bounds.north);
  const projectY = (latitude: number) => ((1 - Math.asinh(Math.tan((latitude * Math.PI) / 180)) / Math.PI) / 2) * n;
  const y0 = Math.max(0, Math.floor(projectY(north)) - margin);
  const y1 = Math.min(n - 1, Math.ceil(projectY(south)) - 1 + margin);
  const result = new Map<string, GfsTileCoordinate>();
  for (const [west, east] of longitudeBands(bounds)) {
    const x0 = Math.floor(((Math.max(-180, west) + 180) / 360) * n) - margin;
    // The east edge is exclusive, so east=180 never produces x=n.
    const x1 = Math.ceil(((Math.min(180, east) + 180) / 360) * n) - 1 + margin;
    for (let x = x0; x <= x1; x += 1) {
      const wrappedX = ((x % n) + n) % n;
      for (let y = y0; y <= y1; y += 1) if (y >= 0 && y < n) result.set(`${z}:${wrappedX}:${y}`, { z, x: wrappedX, y });
    }
  }
  return [...result.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function tileKey(tile: GfsTileCoordinate, forecastHour: number) {
  return `${forecastHour}/${tile.z}/${tile.x}/${tile.y}`;
}

export function tileContainsCoordinate(grid: GfsGrid, coordinate: MapCenter) {
  const [longitude, latitude] = coordinate;
  return latitude >= grid.bounds.south && latitude <= grid.bounds.north && longitude >= grid.bounds.west && longitude <= grid.bounds.east;
}
