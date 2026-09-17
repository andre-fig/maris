import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
} from '@maplibre/maplibre-react-native';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import soundings from './assets/data/miami-soundg.json';
import { ScaleRuler } from './components/ScaleRuler';

const MIAMI: [number, number] = [-80.1918, 25.7617];
const BASE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';
const SOUNDINGS = soundings as unknown as GeoJSON.FeatureCollection<GeoJSON.Point>;

export default function App() {
  const { width } = useWindowDimensions();
  const [viewState, setViewState] = useState({ latitude: MIAMI[1], zoom: 11 });

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
          setViewState({
            latitude: nativeEvent.center[1],
            zoom: nativeEvent.zoom,
          });
        }}
      >
        <Camera
          initialViewState={{
            center: MIAMI,
            zoom: 11,
          }}
        />
        <GeoJSONSource id="miami-soundg" data={SOUNDINGS}>
          <Layer
            id="miami-soundg-depth"
            type="symbol"
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
        </GeoJSONSource>
      </Map>
      <View pointerEvents="none" style={styles.scaleOverlay}>
        <ScaleRuler
          latitude={viewState.latitude}
          maxWidth={Math.min(width - 96, 210)}
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
