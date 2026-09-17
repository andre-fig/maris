import {
  Camera,
  Layer,
  Map,
  OfflineManager,
  VectorSource,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { ScaleRuler } from './components/ScaleRuler';

const MIAMI: [number, number] = [-80.1918, 25.7617];
const BASE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  'https://api-production-7dc7.up.railway.app';

export default function App() {
  const { width } = useWindowDimensions();
  const [viewState, setViewState] = useState({ latitude: MIAMI[1], zoom: 11 });
  const [isZooming, setIsZooming] = useState(false);
  const lastZoom = useRef(11);

  useEffect(() => {
    void OfflineManager.setMaximumAmbientCacheSize(256 * 1024 * 1024);
  }, []);

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={BASE_MAP_STYLE}
        logo={false}
        attribution={false}
        compass={false}
        scaleBar={false}
        touchZoom
        touchRotate
        touchPitch={false}
        onRegionIsChanging={({ nativeEvent }) => {
          if (Math.abs(nativeEvent.zoom - lastZoom.current) > 0.0001) {
            setIsZooming(true);
          }

          lastZoom.current = nativeEvent.zoom;
          setViewState({
            latitude: nativeEvent.center[1],
            zoom: nativeEvent.zoom,
          });
        }}
        onRegionDidChange={({ nativeEvent }) => {
          lastZoom.current = nativeEvent.zoom;
          setViewState({
            latitude: nativeEvent.center[1],
            zoom: nativeEvent.zoom,
          });
          setIsZooming(false);
        }}
      >
        <Camera
          initialViewState={{
            center: MIAMI,
            zoom: 11,
          }}
        />
        <VectorSource
          id="miami-soundg"
          url={`${API_URL}/tiles/soundg.json`}
        >
          <Layer
            id="miami-soundg-depth"
            type="symbol"
            source-layer="soundings"
            beforeId="water_name_point_label"
            minzoom={10}
            layout={{
              'text-field': ['to-string', ['get', 'DEPTH']],
              'text-font': ['Noto Sans Regular'],
              'text-size': [
                'interpolate',
                ['linear'],
                ['zoom'],
                10,
                9,
                14,
                12,
              ],
              'text-padding': 1,
            }}
            paint={{
              'text-color': '#173f4d',
              'text-halo-color': '#dceef3',
              'text-halo-width': 1,
            }}
          />
        </VectorSource>
      </Map>
      <View pointerEvents="none" style={styles.scaleOverlay}>
        <ScaleRuler
          latitude={viewState.latitude}
          maxWidth={Math.min(width - 96, 175)}
          visible={isZooming}
          zoom={viewState.zoom}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  scaleOverlay: {
    position: 'absolute',
    top: 64,
    right: 0,
    left: 0,
    alignItems: 'center',
  },
});
