/** SVG affine matrix for rotation around a point, computed on the UI runtime. */
export function compassRotationMatrix(
  degrees: number,
  cx: number,
  cy: number,
): [number, number, number, number, number, number] {
  "worklet";
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

/** Send SVG's native matrix prop, bypassing Reanimated's CSS transform parser. */
export function svgMatrixAdapter(props: Record<string, unknown>) {
  "worklet";
  if ("transform" in props) {
    props.matrix = props.transform;
    delete props.transform;
  }
}
