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
              name="navigation"
              size={20}
              style={styles.navigation}
            />
          </>
        ) : (
          <>
            <SymbolView
              name="circle.fill"
              size={36}
              style={styles.circle}
              tintColor="#0A84FF"
              type="monochrome"
            />
            <SymbolView
              name="circle"
              size={36}
              style={styles.circle}
              tintColor="#FFFFFF"
              type="monochrome"
              weight="semibold"
            />
            <SymbolView
              name="location.north.fill"
              size={20}
              style={styles.navigation}
              tintColor="#FFFFFF"
              type="monochrome"
              weight="bold"
            />
          </>
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
});
