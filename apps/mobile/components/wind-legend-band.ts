// Lower bounds, in the same descending order as the displayed legend.
const MINIMUM_SPEEDS = [32.6, 28.5, 24.5, 20.8, 17.2, 13.9, 10.8, 8, 5.5, 0];

export function formatWindLegendLabel(label: string, unit: 'm/s' | 'km/h') {
  if (unit === 'm/s') return label;
  const prefix = label.startsWith('>') || label.startsWith('<') ? label[0] : '';
  const speed = Number(prefix ? label.slice(1) : label);
  return prefix + (Math.round(speed * 3.6 * 10) / 10).toString();
}

export function windLegendBand(speed: number | null | undefined): number {
  if (speed == null || !Number.isFinite(speed) || speed < 0) return -1;
  return MINIMUM_SPEEDS.findIndex(minimum => speed >= minimum);
}
