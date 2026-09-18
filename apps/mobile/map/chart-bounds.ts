import type { AreaBounds } from "../offline/offline-style";

export function isWithinChartBounds(bounds: AreaBounds | undefined, longitude: number, latitude: number): boolean {
  if (!bounds || bounds.length !== 4 || ![...bounds, longitude, latitude].every(Number.isFinite)) return false;
  const [west, south, east, north] = bounds;
  if (south > north || latitude < south || latitude > north) return false;
  const lon = ((longitude + 180) % 360 + 360) % 360 - 180;
  const withinLongitude = (x: number) => west <= east ? x >= west && x <= east : x >= west || x <= east;
  return withinLongitude(lon) || (lon === -180 && withinLongitude(180));
}
