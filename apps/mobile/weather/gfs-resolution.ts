export type GfsResolution = 0.25 | 0.5 | 1.0;

export function resolutionForZoom(zoom: number): GfsResolution {
  if (zoom <= 5) return 1.0;
  if (zoom <= 9) return 0.5;
  return 0.25;
}

export function resolutionWithHysteresis(current: GfsResolution, zoom: number): GfsResolution {
  if (current === 1.0) return zoom > 5.5 ? 0.5 : 1.0;
  if (current === 0.5) {
    if (zoom > 9.5) return 0.25;
    if (zoom < 4.5) return 1.0;
    return 0.5;
  }
  return zoom < 8.5 ? 0.5 : 0.25;
}
