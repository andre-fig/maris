import { useCallback, useEffect, useRef } from "react";

export type CameraEvent = {
  center: [number, number];
  zoom: number;
  bearing: number;
};
type Sample = { view: CameraEvent; settled: boolean };

/** Native/Fabric events can arrive during a React commit. Never update React
 * state synchronously from them: deliver only the latest sample next frame. */
export function useCameraEvents(onSample: (view: CameraEvent, settled: boolean) => void,
  onImmediateSample?: (view: CameraEvent) => void) {
  const handler = useRef(onSample);
  handler.current = onSample;
  const immediateHandler = useRef(onImmediateSample);
  immediateHandler.current = onImmediateSample;
  const pending = useRef<Sample | null>(null);
  const frame = useRef<number | null>(null);
  const delivered = useRef<Sample | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      pending.current = null;
    };
  }, []);

  const enqueue = useCallback((view: CameraEvent, settled: boolean) => {
    if (!mounted.current || ![...view.center, view.zoom, view.bearing].every(Number.isFinite)) return;
    // Shared-value updates only; React state still goes through the frame queue.
    immediateHandler.current?.(view);
    pending.current = { view: { ...view, center: [...view.center] }, settled };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const sample = pending.current;
      pending.current = null;
      if (!mounted.current || !sample) return;
      const previous = delivered.current;
      if (previous && previous.settled === sample.settled &&
        previous.view.center[0] === sample.view.center[0] && previous.view.center[1] === sample.view.center[1] &&
        previous.view.zoom === sample.view.zoom && previous.view.bearing === sample.view.bearing) return;
      delivered.current = sample;
      handler.current(sample.view, sample.settled);
    });
  }, []);

  const onRegionIsChanging = useCallback(({ nativeEvent }: { nativeEvent: CameraEvent }) => enqueue(nativeEvent, false), [enqueue]);
  const onRegionDidChange = useCallback(({ nativeEvent }: { nativeEvent: CameraEvent }) => enqueue(nativeEvent, true), [enqueue]);
  return { onRegionIsChanging, onRegionDidChange };
}
