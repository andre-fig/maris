import type { GfsBounds, GfsGrid, GfsFieldName } from "./gfs.types.js";

export const GFS_TILE_SIZE_DEGREES = 10;
export const GFS_TILE_COLUMNS = 36;
export const GFS_TILE_ROWS = 18;

export type GfsTileCoordinate = { x: number; y: number };

export function gfsTileBounds(x: number, y: number): GfsBounds {
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
  const west = -180 + x * GFS_TILE_SIZE_DEGREES;
  const south = -90 + y * GFS_TILE_SIZE_DEGREES;
  return {
    west,
    east: west + GFS_TILE_SIZE_DEGREES,
    south,
    north: south + GFS_TILE_SIZE_DEGREES,
  };
}

export function gfsTileFromCoordinate(
  longitude: number,
  latitude: number,
): GfsTileCoordinate {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new RangeError("Invalid GFS coordinate");
  }
  const normalizedLongitude = Math.min(
    179.999999999,
    Math.max(-180, longitude),
  );
  const normalizedLatitude = Math.min(89.999999999, Math.max(-90, latitude));
  return {
    x: Math.floor((normalizedLongitude + 180) / GFS_TILE_SIZE_DEGREES),
    y: Math.floor((normalizedLatitude + 90) / GFS_TILE_SIZE_DEGREES),
  };
}

const TILE_FIELDS: readonly GfsFieldName[] = [
  "windU",
  "windV",
  "temperature",
  "precipitation",
  "precipitationRate",
  "cloudCover",
  "pressure",
  "gust",
  "humidity",
];

export type GfsBinaryTileHeader = Pick<
  GfsGrid,
  | "model"
  | "run"
  | "forecastTime"
  | "forecastHour"
  | "resolution"
  | "bounds"
  | "width"
  | "height"
  | "gridOrder"
  | "longitudeConvention"
  | "units"
> & { version: 1; fields: GfsFieldName[] };

export const GFS_BINARY_MAGIC = "MGFS";
export const GFS_BINARY_VERSION = 1;

export function encodeGfsTile(grid: GfsGrid): Buffer {
  const fields = TILE_FIELDS.filter((field) => {
    const values = grid.fields[field];
    return Boolean(values && values.length === grid.width * grid.height);
  });
  const header: GfsBinaryTileHeader = {
    version: GFS_BINARY_VERSION,
    model: grid.model,
    run: grid.run,
    forecastTime: grid.forecastTime,
    forecastHour: grid.forecastHour,
    resolution: grid.resolution,
    bounds: grid.bounds,
    width: grid.width,
    height: grid.height,
    gridOrder: grid.gridOrder,
    longitudeConvention: grid.longitudeConvention,
    units: grid.units,
    fields: [...fields],
  };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const count = grid.width * grid.height;
  const bytesPerField = count + count * 4;
  const output = Buffer.alloc(
    12 + headerBytes.length + fields.length * bytesPerField,
  );
  output.write(GFS_BINARY_MAGIC, 0, 4, "ascii");
  output.writeUInt16LE(GFS_BINARY_VERSION, 4);
  output.writeUInt16LE(0, 6);
  output.writeUInt32LE(headerBytes.length, 8);
  headerBytes.copy(output, 12);

  let offset = 12 + headerBytes.length;
  for (const field of fields) {
    const values = grid.fields[field]!;
    for (let index = 0; index < count; index += 1) {
      const value = values[index];
      const valid = typeof value === "number" && Number.isFinite(value);
      output[offset + index] = valid ? 1 : 0;
      output.writeFloatLE(valid ? value : 0, offset + count + index * 4);
    }
    offset += bytesPerField;
  }
  return output;
}

export function decodeGfsTile(buffer: Uint8Array): {
  header: GfsBinaryTileHeader;
  fields: Partial<Record<GfsFieldName, Array<number | null>>>;
} {
  if (
    buffer.byteLength < 12 ||
    new TextDecoder().decode(buffer.slice(0, 4)) !== GFS_BINARY_MAGIC
  ) {
    throw new Error("Invalid GFS tile magic");
  }
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  if (view.getUint16(4, true) !== GFS_BINARY_VERSION)
    throw new Error("Unsupported GFS tile version");
  const headerLength = view.getUint32(8, true);
  const header = JSON.parse(
    new TextDecoder().decode(buffer.slice(12, 12 + headerLength)),
  ) as GfsBinaryTileHeader;
  const count = header.width * header.height;
  const bytesPerField = count + count * 4;
  let offset = 12 + headerLength;
  const fields: Partial<Record<GfsFieldName, Array<number | null>>> = {};
  for (const field of header.fields) {
    if (offset + bytesPerField > buffer.byteLength)
      throw new Error("Truncated GFS tile");
    const values = new Array<number | null>(count);
    for (let index = 0; index < count; index += 1) {
      values[index] = buffer[offset + index]
        ? view.getFloat32(offset + count + index * 4, true)
        : null;
    }
    fields[field] = values;
    offset += bytesPerField;
  }
  return { header, fields };
}
