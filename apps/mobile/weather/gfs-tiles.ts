import type { GfsBounds, GfsGrid, MapCenter } from "./gfs-grid";

export const GFS_TILE_SIZE = 10;
export const GFS_TILE_COLUMNS = 36;
export const GFS_TILE_ROWS = 18;

export type GfsTileCoordinate = { x: number; y: number };

export function tileBounds({ x, y }: GfsTileCoordinate): GfsBounds {
  if (
    !Number.isInteger(x) ||
    x < 0 ||
    x >= GFS_TILE_COLUMNS ||
    !Number.isInteger(y) ||
    y < 0 ||
    y >= GFS_TILE_ROWS
  ) {
    throw new RangeError("Invalid GFS tile coordinate");
  }
  const west = -180 + x * GFS_TILE_SIZE;
  const south = -90 + y * GFS_TILE_SIZE;
  return {
    west,
    east: west + GFS_TILE_SIZE,
    south,
    north: south + GFS_TILE_SIZE,
  };
}

export function tileForCoordinate(
  longitude: number,
  latitude: number,
): GfsTileCoordinate {
  const normalizedLongitude = ((((longitude + 180) % 360) + 360) % 360) - 180;
  const clampedLatitude = Math.max(-90, Math.min(89.999999999, latitude));
  return {
    x: Math.floor((normalizedLongitude + 180) / GFS_TILE_SIZE),
    y: Math.floor((clampedLatitude + 90) / GFS_TILE_SIZE),
  };
}

function longitudeBands(bounds: GfsBounds) {
  if (bounds.west <= bounds.east) return [[bounds.west, bounds.east]];
  return [
    [bounds.west, 180],
    [-180, bounds.east],
  ];
}

export function tilesForViewport(
  bounds: GfsBounds,
  margin = 1,
): GfsTileCoordinate[] {
  if (
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.south) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.west) ||
    bounds.north < bounds.south
  )
    return [];
  const south = Math.max(-90, bounds.south);
  const north = Math.min(90, bounds.north);
  const y0 = Math.max(0, Math.floor((south + 90) / GFS_TILE_SIZE) - margin);
  const y1 = Math.min(
    GFS_TILE_ROWS - 1,
    Math.ceil((north + 90) / GFS_TILE_SIZE) - 1 + margin,
  );
  const result = new Map<string, GfsTileCoordinate>();
  for (const [west, east] of longitudeBands(bounds)) {
    const x0 =
      Math.floor((Math.max(-180, west) + 180) / GFS_TILE_SIZE) - margin;
    const x1 =
      Math.ceil((Math.min(180, east) + 180) / GFS_TILE_SIZE) - 1 + margin;
    for (let x = x0; x <= x1; x += 1) {
      const wrappedX =
        ((x % GFS_TILE_COLUMNS) + GFS_TILE_COLUMNS) % GFS_TILE_COLUMNS;
      for (let y = y0; y <= y1; y += 1) {
        if (y >= 0 && y < GFS_TILE_ROWS)
          result.set(`${wrappedX}:${y}`, { x: wrappedX, y });
      }
    }
  }
  return [...result.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function tileKey(tile: GfsTileCoordinate, forecastHour: number) {
  return `${forecastHour}/${tile.x}/${tile.y}`;
}

export function tileContainsCoordinate(grid: GfsGrid, coordinate: MapCenter) {
  const [longitude, latitude] = coordinate;
  return (
    latitude >= grid.bounds.south &&
    latitude <= grid.bounds.north &&
    longitude >= grid.bounds.west &&
    longitude <= grid.bounds.east
  );
}
