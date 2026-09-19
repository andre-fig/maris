import type { GfsBounds } from './gfs-grid';
import { tilesForViewport, type GfsTileCoordinate } from './gfs-tiles';

export const GFS_MAX_WEATHER_ZOOM = 6;
export const GFS_TILE_MARGIN = 1;
export const DEFAULT_MAX_FIELD_DIMENSION = 2048;

function validBounds(bounds: GfsBounds | null | undefined): bounds is GfsBounds {
  return Boolean(bounds) &&
    [bounds!.north, bounds!.south, bounds!.east, bounds!.west].every(Number.isFinite) &&
    bounds!.north > bounds!.south;
}

export function sourceZoomForMapZoom(mapZoom: number, qualityPenalty = 0) {
  const penalty = Number.isFinite(qualityPenalty) ? Math.max(0, Math.floor(qualityPenalty)) : 0;
  return Math.max(0, Math.min(GFS_MAX_WEATHER_ZOOM, Math.round(mapZoom)) - penalty);
}

export function fieldDimensionsForTiles(tiles: GfsTileCoordinate[]) {
  if (!tiles.length) return { width: 0, height: 0 };
  const z = tiles[0]!.z;
  const tileCount = 2 ** z;
  const xValues = [...new Set(tiles.map((tile) => tile.x))].sort((a, b) => a - b);
  const yValues = [...new Set(tiles.map((tile) => tile.y))].sort((a, b) => a - b);
  if (xValues[xValues.length - 1]! - xValues[0]! > tileCount / 2) {
    return { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY };
  }
  return {
    width: (xValues[xValues.length - 1]! - xValues[0]!) * 64 + 65,
    height: (yValues[yValues.length - 1]! - yValues[0]!) * 64 + 65,
  };
}

export function sourceZoomForViewport(
  bounds: GfsBounds | null | undefined,
  mapZoom: number,
  qualityPenalty = 0,
  maxFieldDimension = DEFAULT_MAX_FIELD_DIMENSION,
) {
  const initialZoom = sourceZoomForMapZoom(mapZoom, qualityPenalty);
  for (let z = initialZoom; z >= 0; z -= 1) {
    const tiles = validBounds(bounds) ? tilesForViewport(bounds, z, GFS_TILE_MARGIN) : [];
    const dimensions = fieldDimensionsForTiles(tiles);
    if (dimensions.width <= maxFieldDimension && dimensions.height <= maxFieldDimension) {
      return { sourceZoom: z, tiles };
    }
  }
  return {
    sourceZoom: 0,
    tiles: validBounds(bounds) ? tilesForViewport(bounds, 0, GFS_TILE_MARGIN) : [],
  };
}
