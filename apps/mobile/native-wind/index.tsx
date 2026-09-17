import { requireNativeComponent, type ViewProps } from 'react-native';

export type WindLayerProps = ViewProps & {
  enabled: boolean;
  opacity?: number;
  density?: number;
  animationSpeed?: number;
};

// Zero-size control view. All pixels are rendered inside MapLibre, not this view.
export const NativeWindLayer = requireNativeComponent<WindLayerProps>('MarisWindControl');
