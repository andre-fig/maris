import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { resolveHeading, smoothHeading } from './navigation-heading';

export const MIN_COG_SPEED_MPS = 0.5;

function readCog(speed: number | null, heading: number | null) {
  if (
    speed === null ||
    !Number.isFinite(speed) ||
    speed < MIN_COG_SPEED_MPS ||
    heading === null ||
    !Number.isFinite(heading) ||
    heading < 0
  ) {
    return null;
  }
  return ((heading % 360) + 360) % 360;
}

export type DeviceLocation = {
  coordinate: [number, number];
  /** Estimated horizontal accuracy in metres, when provided by iOS/Android. */
  accuracy: number | null;
  speed: number | null;
  cog: number | null;
  heading: number | null;
  headingValue: SharedValue<number | null>;
};

export function useDeviceLocation(): DeviceLocation | null {
  const [coordinate, setCoordinate] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [cog, setCog] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const headingValue = useSharedValue<number | null>(null);
  const compassRef = useRef<number | null>(null);
  const smoothedHeadingRef = useRef<number | null>(null);

  useEffect(() => {
  let active = true;
    let locationSubscription: Location.LocationSubscription | undefined;
    let headingSubscription: Location.LocationSubscription | undefined;

    const publishHeading = () => {
      const nextHeading = compassRef.current;
      const smoothedHeading =
        nextHeading === null
          ? null
          : smoothHeading(smoothedHeadingRef.current, nextHeading);
      smoothedHeadingRef.current = smoothedHeading;
      headingValue.value = smoothedHeading;
      setHeading((currentHeading) =>
        currentHeading === smoothedHeading ? currentHeading : smoothedHeading,
      );
    };

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
        setAccuracy(lastKnownPosition.coords.accuracy ?? null);
        setSpeed(lastKnownPosition.coords.speed ?? null);
        setCog(readCog(lastKnownPosition.coords.speed, lastKnownPosition.coords.heading));
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
          setAccuracy(coords.accuracy ?? null);
          setSpeed(coords.speed ?? null);
          setCog(readCog(coords.speed, coords.heading));
        },
      );

      headingSubscription = await Location.watchHeadingAsync((value) => {
        if (!active) return;
        const nextHeading = resolveHeading(
          value.trueHeading,
          value.magHeading,
        );

        // Keep the last valid reading visible while the sensor temporarily
        // reports an invalid/low-confidence sample.
        if (nextHeading === null) return;

        compassRef.current = nextHeading;
        publishHeading();
      });
    };

    void start().catch(() => {
      // Location is optional: without permission or a signal, the marker is hidden.
    });

    return () => {
      active = false;
      locationSubscription?.remove();
      headingSubscription?.remove();
    };
  }, [headingValue]);

  if (!coordinate) return null;

  return { coordinate, accuracy, speed, cog, heading, headingValue };
}
