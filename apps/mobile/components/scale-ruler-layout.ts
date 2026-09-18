export function scaleDivisionPercentages(segments: number) {
  return Array.from(
    { length: segments + 1 },
    (_, index) => (index / segments) * 100,
  );
}
