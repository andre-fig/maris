import { requireNativeComponent, type ViewProps, type NativeSyntheticEvent } from 'react-native';

export type WindLayerProps = ViewProps & {
  enabled: boolean;
  opacity?: number;
  density?: number;
  animationSpeed?: number;
  sampleCoordinate?: [number, number] | null;
  onCenterWind?: (event: NativeSyntheticEvent<{ speed: number | null; coordinate: [number, number] }>) => void;
  onDataStatus?: (event: NativeSyntheticEvent<{ stale: boolean; savedAt: number }>) => void;
};

// Zero-size control view. All pixels are rendered inside MapLibre, not this view.
export const NativeWindLayer = requireNativeComponent<WindLayerProps>('MarisWindControl');
