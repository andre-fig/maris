import type { GfsFieldName, GfsGrid } from "./gfs-grid";

const MAGIC = "MGFS";
const VERSION = 1;

type Header = Pick<
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

export function decodeGfsTile(bytes: Uint8Array): GfsGrid {
  if (
    bytes.byteLength < 12 ||
    new TextDecoder().decode(bytes.slice(0, 4)) !== MAGIC
  ) {
    throw new Error("Invalid GFS tile magic");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(4, true) !== VERSION)
    throw new Error("Unsupported GFS tile version");
  const headerLength = view.getUint32(8, true);
  const header = JSON.parse(
    new TextDecoder().decode(bytes.slice(12, 12 + headerLength)),
  ) as Header;
  if (
    header.version !== VERSION ||
    !Number.isInteger(header.width) ||
    !Number.isInteger(header.height)
  ) {
    throw new Error("Invalid GFS tile header");
  }
  const count = header.width * header.height;
  const bytesPerField = count + count * 4;
  let offset = 12 + headerLength;
  const fields: Partial<Record<GfsFieldName, Array<number | null>>> = {};
  for (const field of header.fields) {
    if (offset + bytesPerField > bytes.byteLength)
      throw new Error("Truncated GFS tile");
    const values = new Array<number | null>(count);
    for (let index = 0; index < count; index += 1) {
      values[index] = bytes[offset + index]
        ? view.getFloat32(offset + count + index * 4, true)
        : null;
    }
    fields[field] = values;
    offset += bytesPerField;
  }
  return { ...header, fields };
}
