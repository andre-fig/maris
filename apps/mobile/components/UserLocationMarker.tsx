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
    <Marker id="device-location" lngLat={coordinate} anchor="center">
      <View
        pointerEvents="none"
        style={[styles.marker, { transform: [{ rotate: `${rotation}deg` }] }]}
      >
        {Platform.OS === 'android' ? (
          <>
            <MaterialIcons
              color="#0A84FF"
              name="circle"
              size={36}
              style={styles.circle}
            />
            <MaterialIcons
              color="#FFFFFF"
              name="radio-button-unchecked"
              size={36}
              style={styles.circle}
            />
            <MaterialIcons
              color="#FFFFFF"
              name="assistant-navigation"
              size={20}
              style={styles.navigation}
            />
          </>
        ) : (
          <SymbolView
            colors={['#FFFFFF', '#0A84FF']}
            name="location.north.circle.fill"
            size={38}
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
  marker: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    width: 36,
    height: 36,
  },
  navigation: {
    position: 'absolute',
    width: 20,
    height: 20,
  },
  integratedSymbol: {
    width: 38,
    height: 38,
  },
});
