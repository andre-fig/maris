export const HEADING_SMOOTHING = 0.2;

export function normalizeHeading(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  return ((value % 360) + 360) % 360;
}

export function resolveHeading(
  trueHeading: number | null,
  magneticHeading: number | null,
  accuracy: number | null,
): number | null {
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy <= 0) {
    return null;
  }

  return normalizeHeading(trueHeading) ?? normalizeHeading(magneticHeading);
}

export function smoothHeading(
  previous: number | null,
  next: number,
  smoothingFactor = HEADING_SMOOTHING,
): number {
  const normalizedNext = normalizeHeading(next) ?? 0;
  if (previous === null) return normalizedNext;

  const delta = ((normalizedNext - previous + 540) % 360) - 180;
  return normalizeHeading(previous + delta * smoothingFactor) ?? normalizedNext;
}
