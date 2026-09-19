import { requireNativeComponent, type ViewProps, type NativeSyntheticEvent } from 'react-native';

export type NativeWindTile = {
  z: number;
  x: number;
  y: number;
  version?: string;
  bounds: { north: number; south: number; east: number; west: number };
  width: number;
  height: number;
  windU: Array<number | null>;
  windV: Array<number | null>;
};

export type NativeWindField = {
  tiles: NativeWindTile[];
  forecastTime: string;
  sourceZoom: number;
  resolution: number;
  fieldKey?: string;
  run?: string;
  model?: string;
};

export type WindLayerProps = ViewProps & {
  enabled: boolean;
  opacity?: number;
  density?: number;
  animationSpeed?: number;
  windField?: NativeWindField | null;
  sampleCoordinate?: [number, number] | null;
  onCenterWind?: (event: NativeSyntheticEvent<{ speed: number | null; coordinate: [number, number] }>) => void;
  onDataStatus?: (event: NativeSyntheticEvent<{ stale: boolean; savedAt: number; loading: boolean }>) => void;
};

// Zero-size control view. All pixels are rendered inside MapLibre, not this view.
export const NativeWindLayer = requireNativeComponent<WindLayerProps>('MarisWindControl');
