import { Marker } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

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
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          duration: 850,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          duration: 850,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const rotation = heading === null ? 0 : heading - mapBearing;
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1.35],
  });

  return (
    <Marker id="device-location" lngLat={coordinate} anchor="center">
      <View pointerEvents="none" style={styles.marker}>
        {heading !== null ? (
          <View
            style={[
              styles.directionContainer,
              { transform: [{ rotate: `${rotation}deg` }] },
            ]}
          >
            <View style={styles.directionBeam} />
          </View>
        ) : null}
        <View style={styles.positionDot} />
        <Animated.View
          style={[
            styles.pulseDot,
            { transform: [{ scale: pulseScale }] },
          ]}
        />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionContainer: {
    position: 'absolute',
    width: 86,
    height: 86,
    alignItems: 'center',
  },
  directionBeam: {
    position: 'absolute',
    top: 3,
    width: 0,
    height: 0,
    borderLeftWidth: 19,
    borderRightWidth: 19,
    borderTopWidth: 0,
    borderBottomWidth: 40,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(0, 122, 255, 0.28)',
    transform: [{ rotate: '180deg' }],
  },
  positionDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    backgroundColor: '#7D838A',
  },
  pulseDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0A84FF',
  },
});
