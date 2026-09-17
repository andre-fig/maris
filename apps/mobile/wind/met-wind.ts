import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";

const MET_WIND_API = "https://beta.yr-maps.met.no/api/wind";
const TILE_SIZE = 256;
const USER_AGENT = "Maris/1.0 (https://github.com/andre-fig/maris; mobile wind overlay)";

export type WindTileKey = `${number}/${number}/${number}`;

export type WindFieldTile = {
  key: WindTileKey;
  z: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: Uint8Array;
};

export type ColoredWindTile = WindFieldTile & { image: import("@shopify/react-native-skia").SkImage };

type WindAvailability = {
  times?: Array<{ time: string; tiles?: { png?: string } }>;
};

const metadataCache: { url?: string; expiresAt: number } = { expiresAt: 0 };
const tileCache = new Map<WindTileKey, WindFieldTile>();
const inflight = new Map<WindTileKey, Promise<WindFieldTile | null>>();

function clampLatitude(latitude: number) {
  return Math.max(-85.051129, Math.min(85.051129, latitude));
}

export function tileForCoordinate(longitude: number, latitude: number, zoom: number) {
  const z = Math.max(0, Math.min(6, Math.round(zoom)));
  const n = 2 ** z;
  const x = Math.floor(((longitude + 180) / 360) * n);
  const phi = (clampLatitude(latitude) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n);
  return { z, x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

export function visibleWindTiles(
  center: [number, number], zoom: number, width: number, height: number,
): Array<{ z: number; x: number; y: number }> {
  const { z } = tileForCoordinate(center[0], center[1], zoom);
  const n = 2 ** z;
  const world = TILE_SIZE * n;
  const centerTile = tileForCoordinate(center[0], center[1], z);
  const centerPixelX = ((center[0] + 180) / 360) * world;
  const phi = (clampLatitude(center[1]) * Math.PI) / 180;
  const centerPixelY = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * world;
  const radiusX = width / 2 + TILE_SIZE;
  const radiusY = height / 2 + TILE_SIZE;
  const minX = Math.floor((centerPixelX - radiusX) / TILE_SIZE);
  const maxX = Math.floor((centerPixelX + radiusX) / TILE_SIZE);
  const minY = Math.max(0, Math.floor((centerPixelY - radiusY) / TILE_SIZE));
  const maxY = Math.min(n - 1, Math.floor((centerPixelY + radiusY) / TILE_SIZE));
  const result: Array<{ z: number; x: number; y: number }> = [];
  const seen = new Set<string>();
  for (let rawX = minX; rawX <= maxX; rawX += 1) {
    const x = ((rawX % n) + n) % n;
    for (let y = minY; y <= maxY; y += 1) {
      const key = `${z}/${x}/${y}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ z, x, y });
      }
    }
  }
  // Keep the center tile first so the overlay can appear as soon as possible.
  result.sort((a, b) => Number(a.x !== centerTile.x || a.y !== centerTile.y) - Number(b.x !== centerTile.x || b.y !== centerTile.y));
  return result;
}

async function windTileTemplate() {
  if (metadataCache.url && metadataCache.expiresAt > Date.now()) return metadataCache.url;
  const response = await fetch(`${MET_WIND_API}/available.json`, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`MET wind metadata failed (${response.status})`);
  const data = (await response.json()) as WindAvailability;
  const url = data.times?.[0]?.tiles?.png;
  if (!url) throw new Error("MET wind metadata has no PNG tile template");
  metadataCache.url = url;
  metadataCache.expiresAt = Date.now() + 15 * 60_000;
  return url;
}

async function loadTile(tile: { z: number; x: number; y: number }): Promise<WindFieldTile | null> {
  const key = `${tile.z}/${tile.x}/${tile.y}` as WindTileKey;
  const cached = tileCache.get(key);
  if (cached) return cached;
  const existing = inflight.get(key);
  if (existing) return existing;
  const request = (async () => {
    try {
      const template = await windTileTemplate();
      const response = await fetch(template.replace("{z}", String(tile.z)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y)), { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
      if (!image) return null;
      const info = image.getImageInfo();
      const pixels = image.readPixels(0, 0, {
        width: info.width,
        height: info.height,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      }) as Uint8Array | null;
      if (!pixels) return null;
      const value = { key, ...tile, width: info.width, height: info.height, pixels };
      tileCache.set(key, value);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  return request;
}

export async function loadWindTiles(tiles: Array<{ z: number; x: number; y: number }>) {
  return (await Promise.all(tiles.map(loadTile))).filter((tile): tile is WindFieldTile => tile !== null);
}

export function sampleWind(tiles: WindFieldTile[], longitude: number, latitude: number) {
  if (!tiles.length) return null;
  const first = tiles[0];
  const n = 2 ** first.z;
  const worldX = ((longitude + 180) / 360) * n * TILE_SIZE;
  const phi = (clampLatitude(latitude) * Math.PI) / 180;
  const worldY = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n * TILE_SIZE;
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  const tile = tiles.find((candidate) => candidate.x === ((tileX % n) + n) % n && candidate.y === tileY);
  if (!tile) return null;
  const px = Math.max(0, Math.min(tile.width - 1, Math.floor(worldX - tileX * TILE_SIZE)));
  const py = Math.max(0, Math.min(tile.height - 1, Math.floor(worldY - tileY * TILE_SIZE)));
  const offset = (py * tile.width + px) * 4;
  // MET wind tiles: R/G are (component * 2) + 128; B is unused.
  return { east: (tile.pixels[offset] - 128) / 2, north: (tile.pixels[offset + 1] - 128) / 2 };
}

const WIND_STOPS: Array<[number, [number, number, number]]> = [
  [0, [167, 206, 161]], [5.5, [121, 204, 172]], [8, [60, 190, 190]],
  [10.8, [19, 168, 214]], [13.9, [75, 135, 234]], [17.2, [123, 87, 237]],
  [20.8, [112, 67, 168]], [24.5, [91, 39, 141]], [28.5, [77, 10, 108]], [32.6, [49, 0, 71]],
];

function windColor(speed: number): [number, number, number] {
  const value = Math.max(0, Math.min(32.6, speed));
  for (let index = 1; index < WIND_STOPS.length; index += 1) {
    const [upper, upperColor] = WIND_STOPS[index];
    const [lower, lowerColor] = WIND_STOPS[index - 1];
    if (value <= upper) {
      const t = (value - lower) / (upper - lower);
      return [0, 1, 2].map((channel) => Math.round(lowerColor[channel] + (upperColor[channel] - lowerColor[channel]) * t)) as [number, number, number];
    }
  }
  return WIND_STOPS[WIND_STOPS.length - 1][1];
}

export function createWindGradientImage(tile: WindFieldTile): ColoredWindTile | null {
  const rgba = new Uint8Array(tile.width * tile.height * 4);
  for (let pixel = 0; pixel < tile.width * tile.height; pixel += 1) {
    const input = pixel * 4;
    const east = (tile.pixels[input] - 128) / 2;
    const north = (tile.pixels[input + 1] - 128) / 2;
    const [red, green, blue] = windColor(Math.hypot(east, north));
    const output = pixel * 4;
    rgba[output] = red;
    rgba[output + 1] = green;
    rgba[output + 2] = blue;
    rgba[output + 3] = 92;
  }
  const image = Skia.Image.MakeImage({ width: tile.width, height: tile.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }, Skia.Data.fromBytes(rgba), tile.width * 4);
  return image ? { ...tile, image } : null;
}

export function clearWindTileCache() {
  tileCache.clear();
}
