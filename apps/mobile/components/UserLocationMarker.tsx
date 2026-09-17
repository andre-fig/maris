import { Marker } from '@maplibre/maplibre-react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet, View } from 'react-native';

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
    <Marker
      id="device-location"
      lngLat={coordinate}
      anchor="center"
      style={styles.annotation}
    >
      <View
        pointerEvents="none"
        style={[styles.marker, { transform: [{ rotate: `${rotation}deg` }] }]}
      >
        {Platform.OS === 'android' ? (
          <MaterialIcons
            color="#0A84FF"
            name="assistant-navigation"
            size={24}
            style={styles.navigation}
          />
        ) : (
          <SymbolView
            colors={['#FFFFFF', '#0A84FF']}
            name="location.north.circle.fill"
            size={32}
            style={styles.integratedSymbol}
            type="palette"
            weight="semibold"
          />
        )}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  annotation: {
    zIndex: 10000,
    elevation: 10000,
  },
  marker: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navigation: {
    position: 'absolute',
    width: 24,
    height: 24,
  },
  integratedSymbol: {
    width: 32,
    height: 32,
  },
});
