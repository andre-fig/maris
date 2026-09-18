import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

export type DeviceLocation = {
  coordinate: [number, number];
  heading: number | null;
  headingValue: SharedValue<number | null>;
};

export function useDeviceLocation(): DeviceLocation | null {
  const [coordinate, setCoordinate] = useState<[number, number] | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const headingValue = useSharedValue<number | null>(null);

  useEffect(() => {
    let active = true;
    let locationSubscription: Location.LocationSubscription | undefined;
    let headingSubscription: Location.LocationSubscription | undefined;

    const start = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!active || permission.status !== Location.PermissionStatus.GRANTED) {
        return;
      }

      const lastKnownPosition = await Location.getLastKnownPositionAsync({
        maxAge: 30_000,
        requiredAccuracy: 100,
      });

      if (active && lastKnownPosition) {
        setCoordinate([
          lastKnownPosition.coords.longitude,
          lastKnownPosition.coords.latitude,
        ]);
      }

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 1,
          timeInterval: 1_000,
        },
        ({ coords }) => {
          if (!active) return;
          setCoordinate([coords.longitude, coords.latitude]);
        },
      );

      headingSubscription = await Location.watchHeadingAsync((value) => {
        if (!active || value.accuracy <= 0) return;

        const nextHeading = value.trueHeading >= 0 ? value.trueHeading : value.magHeading;
        if (!Number.isFinite(nextHeading)) return;
        headingValue.value = nextHeading;
        setHeading(nextHeading);
      });
    };

    void start().catch(() => {
      // A localização é opcional: sem permissão ou sinal, o marcador não aparece.
    });

    return () => {
      active = false;
      locationSubscription?.remove();
      headingSubscription?.remove();
    };
  }, [headingValue]);

  if (!coordinate) return null;

  return { coordinate, heading, headingValue };
}
