import type { GfsBounds } from '../weather/gfs-grid';
import type { GfsTileCoordinate } from '../weather/gfs-tiles';

const MAX_LATITUDE = 85.05112878;

function mercatorY(latitude: number) {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const phi = (clamped * Math.PI) / 180;
  return (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2;
}

function viewportLongitudeBands(bounds: GfsBounds) {
  const clampLongitude = (longitude: number) => Math.max(-180, Math.min(180, longitude));
  const west = clampLongitude(bounds.west);
  const east = clampLongitude(bounds.east);
  if (west <= east) return [[(west + 180) / 360, (east + 180) / 360]];
  return [[(west + 180) / 360, 1], [0, (east + 180) / 360]];
}

/** Returns the union area of loaded XYZ tiles divided by visible viewport area. */
export function viewportTileCoverage(bounds: GfsBounds | null | undefined, tiles: GfsTileCoordinate[]) {
  if (!bounds || ![bounds.north, bounds.south, bounds.east, bounds.west].every(Number.isFinite) || bounds.north <= bounds.south) return 0;
  if (!tiles.length) return 0;

  const viewportY0 = Math.min(mercatorY(bounds.north), mercatorY(bounds.south));
  const viewportY1 = Math.max(mercatorY(bounds.north), mercatorY(bounds.south));
  const viewportBands = viewportLongitudeBands(bounds);
  const rowIntervals = new Map<string, { y0: number; y1: number; x0: number; x1: number }[]>();
  const seen = new Set<string>();

  for (const tile of tiles) {
    if (!Number.isInteger(tile.z) || tile.z < 0 || tile.x < 0 || tile.y < 0) continue;
    const n = 2 ** tile.z;
    if (tile.x >= n || tile.y >= n) continue;
    const y0 = Math.max(viewportY0, tile.y / n);
    const y1 = Math.min(viewportY1, (tile.y + 1) / n);
    if (y1 <= y0) continue;

    for (const [bandX0, bandX1] of viewportBands) {
      const x0 = Math.max(tile.x / n, bandX0);
      const x1 = Math.min((tile.x + 1) / n, bandX1);
      if (x1 <= x0) continue;
      const key = `${tile.z}/${tile.x}/${tile.y}/${x0}/${x1}/${y0}/${y1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rowKey = `${y0}/${y1}`;
      const intervals = rowIntervals.get(rowKey) ?? [];
      intervals.push({ y0, y1, x0, x1 });
      rowIntervals.set(rowKey, intervals);
    }
  }

  const viewportArea = (viewportY1 - viewportY0) * viewportBands.reduce((sum, [x0, x1]) => sum + Math.max(0, x1 - x0), 0);
  if (viewportArea <= 0) return 0;

  let coveredArea = 0;
  for (const intervals of rowIntervals.values()) {
    intervals.sort((left, right) => left.x0 - right.x0 || left.x1 - right.x1);
    let coveredX = 0;
    let currentX0 = -1;
    let currentX1 = -1;
    for (const interval of intervals) {
      if (currentX0 < 0) {
        currentX0 = interval.x0;
        currentX1 = interval.x1;
      } else if (interval.x0 <= currentX1) {
        currentX1 = Math.max(currentX1, interval.x1);
      } else {
        coveredX += currentX1 - currentX0;
        currentX0 = interval.x0;
        currentX1 = interval.x1;
      }
    }
    if (currentX0 >= 0) coveredX += currentX1 - currentX0;
    coveredArea += coveredX * (intervals[0]!.y1 - intervals[0]!.y0);
  }

  return Math.max(0, Math.min(1, coveredArea / viewportArea));
}
