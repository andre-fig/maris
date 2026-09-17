import { Marker } from '@maplibre/maplibre-react-native';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

type UserLocationMarkerProps = {
  coordinate: [number, number];
  heading: number | null;
  mapBearing: number;
};

export function UserLocationMarker({
  coordinate,
  heading,
  mapBearing,
}: UserLocationMarkerProps) {
  const rotation = heading === null ? 0 : heading - mapBearing;

  return (
    <Marker id="device-location" lngLat={coordinate} anchor="center">
      <View
        pointerEvents="none"
        style={[styles.marker, { transform: [{ rotate: `${rotation}deg` }] }]}
      >
        <SymbolView
          name={{
            android: 'navigation',
            ios: 'location.north.fill',
            web: 'navigation',
          }}
          size={30}
          style={styles.symbol}
          tintColor="#0A84FF"
          type="monochrome"
          weight="semibold"
        />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: {
    width: 30,
    height: 30,
  },
});
