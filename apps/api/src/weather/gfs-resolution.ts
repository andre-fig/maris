import type { GfsFieldName, GfsGrid } from "./gfs.types.js";

export type GfsResolution = 0.25 | 0.5 | 1.0;

export const GFS_RESOLUTIONS: readonly GfsResolution[] = [0.25, 0.5, 1.0];

export function isGfsResolution(value: number): value is GfsResolution {
  return value === 0.25 || value === 0.5 || value === 1;
}

export function resolutionCode(resolution: GfsResolution) {
  return resolution === 0.25 ? "r025" : resolution === 0.5 ? "r050" : "r100";
}

function factorForResolution(resolution: GfsResolution) {
  return resolution === 0.25 ? 1 : resolution === 0.5 ? 2 : 4;
}

function valid(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Aggregates the original 0.25° grid by averaging each field independently.
 * windU/windV are deliberately aggregated as components, never as speed/direction.
 * precipitationRate is a rate, so it is averaged rather than summed.
 */
export function downsampleGfsGrid(
  source: GfsGrid,
  resolution: GfsResolution,
): GfsGrid {
  if (resolution === 0.25) return source;
  const factor = factorForResolution(resolution);
  const width = Math.floor((source.width - 1) / factor) + 1;
  const height = Math.floor((source.height - 1) / factor) + 1;
  const fields: GfsGrid["fields"] = {};

  for (const field of Object.keys(source.fields) as GfsFieldName[]) {
    const input = source.fields[field];
    if (!input || input.length !== source.width * source.height) continue;
    const output = new Array<number | null>(width * height).fill(null);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const startRow = row * factor;
        const startColumn = column * factor;
        const endRow = Math.min(source.height, startRow + factor);
        const endColumn = Math.min(source.width, startColumn + factor);
        let sum = 0;
        let count = 0;
        for (let sourceRow = startRow; sourceRow < endRow; sourceRow += 1) {
          for (
            let sourceColumn = startColumn;
            sourceColumn < endColumn;
            sourceColumn += 1
          ) {
            const value = input[sourceRow * source.width + sourceColumn];
            if (valid(value)) {
              sum += value;
              count += 1;
            }
          }
        }
        output[row * width + column] = count > 0 ? sum / count : null;
      }
    }
    fields[field] = output;
  }

  return { ...source, resolution, width, height, fields };
}
