import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { WEATHER_TTL_MS, WEATHER_RETRY_MS, WEATHER_REQUEST_TIMEOUT_MS, isWeatherFresh } from './weather-policy';

export type MapCenter = [longitude: number, latitude: number];

export type CurrentWeather = {
  latitude: number;
  longitude: number;
  temperature_celsius: number;
  condition: string;
  humidity_percent: number;
  wind_speed_metres_per_second: number;
  wind_direction_degrees: number | null;
  precipitation_millimetres_last_hour: number;
  rain_probability_percent?: number | null;
  rain_probability_at?: string | null;
  icon_code: string;
  observed_at: string;
};

type CameraSample = {
  center: MapCenter;
  timestamp: number;
};

const DEBOUNCE_MS = 1_000;
const MINIMUM_FETCH_DISTANCE_METRES = 5_000;
const CAMERA_SAMPLE_WINDOW_MS = 180;
const INERTIA_PROJECTION_MS = 450;
const EARTH_RADIUS_METRES = 6_371_000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMetres(from: MapCenter, to: MapCenter) {
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const fromLatitude = toRadians(from[1]);
  const toLatitude = toRadians(to[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(haversine));
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

export function predictInertialCenter(samples: CameraSample[]): MapCenter {
  const latest = samples.at(-1);
  if (!latest || samples.length < 2) return latest?.center ?? [0, 0];

  const earliest = samples[0];
  const elapsed = latest.timestamp - earliest.timestamp;
  if (elapsed < 16) return latest.center;

  const longitudeVelocity = (latest.center[0] - earliest.center[0]) / elapsed;
  const latitudeVelocity = (latest.center[1] - earliest.center[1]) / elapsed;

  return [
    normalizeLongitude(
      latest.center[0] + longitudeVelocity * INERTIA_PROJECTION_MS,
    ),
    Math.max(
      -85,
      Math.min(85, latest.center[1] + latitudeVelocity * INERTIA_PROJECTION_MS),
    ),
  ];
}

export function useCurrentViewportWeather(
  apiUrl: string,
  initialCenter: MapCenter,
  enabled: boolean,
) {
  const [weather, setWeather] = useState<CurrentWeather>();
  const [error, setError] = useState<string>();
  const samples = useRef<CameraSample[]>([]);
  const touching = useRef(false);
  const pendingTarget = useRef<MapCenter>(initialCenter);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const activeRequestPoint = useRef<MapCenter | undefined>(undefined);
  // This point is advanced only after a successful response. Failed requests
  // must remain retryable at the same location.
  const lastSuccessfulPoint = useRef<MapCenter | undefined>(undefined);
  // Keep the successful payload independently from the visible card, which
  // can be cleared when zooming back into a different part of the map.
  const lastSuccessfulWeather = useRef<CurrentWeather | undefined>(undefined);
  const lastSuccessAt = useRef(0);
  const retryAt = useRef(0);
  const foreground = useRef(AppState.currentState === 'active');
  const cameraSeen = useRef(false);
  const requestGeneration = useRef(0);
  const enabledRef = useRef(enabled);

  const fetchWeather = useCallback(
    async (center: MapCenter) => {
      if (touching.current || !enabledRef.current || !foreground.current) return;
      if (activeRequestPoint.current && distanceMetres(activeRequestPoint.current, center) < MINIMUM_FETCH_DISTANCE_METRES) return;
      if (
        lastSuccessfulWeather.current &&
        lastSuccessfulPoint.current &&
        isWeatherFresh(lastSuccessAt.current, Date.now()) &&
        distanceMetres(lastSuccessfulPoint.current, center) <
          MINIMUM_FETCH_DISTANCE_METRES
      ) {
        setWeather(lastSuccessfulWeather.current);
        setError(undefined);
        retryAt.current = 0;
        return;
      }

      activeRequest.current?.abort();
      const controller = new AbortController();
      const generation = ++requestGeneration.current;
      activeRequest.current = controller;
      activeRequestPoint.current = center;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, WEATHER_REQUEST_TIMEOUT_MS);

      try {
        const query = new URLSearchParams({
          lat: center[1].toString(),
          lon: center[0].toString(),
        });
        const response = await fetch(`${apiUrl}/weather/current?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
        const payload = (await response.json()) as CurrentWeather;

        if (generation === requestGeneration.current) {
          lastSuccessfulWeather.current = payload;
          lastSuccessfulPoint.current = center;
          lastSuccessAt.current = Date.now();
          retryAt.current = 0;
          setWeather(payload);
          setError(undefined);
        }
      } catch (requestError) {
        if (
          generation === requestGeneration.current &&
          (timedOut || !(requestError instanceof Error && requestError.name === 'AbortError'))
        ) {
          setError('Clima indisponível');
          retryAt.current = Date.now() + WEATHER_RETRY_MS;
        }
      } finally {
        clearTimeout(timeout);
        if (generation === requestGeneration.current) {
          activeRequest.current = undefined;
          activeRequestPoint.current = undefined;
        }
      }
    },
    [apiUrl],
  );

  const scheduleFetch = useCallback(
    (center: MapCenter) => {
      pendingTarget.current = center;
      if (!enabledRef.current) return;

      // A new destination only invalidates an in-flight request when it is a
      // new weather destination (5 km rule). The old response is ignored by
      // generation even if abort delivery races with the new request.
      if (activeRequestPoint.current &&
          distanceMetres(activeRequestPoint.current, center) >= MINIMUM_FETCH_DISTANCE_METRES) {
        activeRequest.current?.abort();
        requestGeneration.current += 1;
        activeRequest.current = undefined;
        activeRequestPoint.current = undefined;
      }

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = undefined;
        void fetchWeather(pendingTarget.current);
      }, DEBOUNCE_MS);
    },
    [fetchWeather],
  );

  const recordCameraCenter = useCallback((center: MapCenter) => {
    cameraSeen.current = true;
    const timestamp = Date.now();
    samples.current = [
      ...samples.current.filter(
        (sample) => timestamp - sample.timestamp <= CAMERA_SAMPLE_WINDOW_MS,
      ),
      { center, timestamp },
    ];
  }, []);

  const onCameraChanging = useCallback(
    (center: MapCenter) => {
      recordCameraCenter(center);
      if (
        enabledRef.current &&
        !touching.current &&
        debounceTimer.current
      ) {
        pendingTarget.current = predictInertialCenter(samples.current);
      }
    },
    [recordCameraCenter],
  );

  const onCameraDidChange = useCallback(
    (center: MapCenter) => {
      recordCameraCenter(center);
      pendingTarget.current = center;
      if (touching.current || !enabledRef.current) return;

      if (!debounceTimer.current) scheduleFetch(center);
    },
    [recordCameraCenter, scheduleFetch],
  );

  const onTouchStart = useCallback(() => {
    touching.current = true;
    samples.current = [];
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = undefined;
    }
  }, []);

  const onTouchEnd = useCallback(
    (remainingTouches: number) => {
      if (remainingTouches > 0) return;
      touching.current = false;
      if (!enabledRef.current) return;
      scheduleFetch(samples.current.length ? predictInertialCenter(samples.current) : pendingTarget.current);
    },
    [scheduleFetch],
  );

  useEffect(() => {
    enabledRef.current = enabled;

    if (!enabled) {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = undefined;
      }
      activeRequest.current?.abort();
      activeRequest.current = undefined;
      activeRequestPoint.current = undefined;
      requestGeneration.current += 1;
      return;
    }

    if (
      lastSuccessfulPoint.current &&
      distanceMetres(lastSuccessfulPoint.current, pendingTarget.current) >=
        MINIMUM_FETCH_DISTANCE_METRES
    ) {
      setWeather(undefined);
    }

    scheduleFetch(pendingTarget.current);
  }, [enabled, scheduleFetch]);

  useEffect(() => {
    if (!cameraSeen.current) pendingTarget.current = initialCenter;
  }, [initialCenter]);

  useEffect(() => {
    const refresh = () => {
      if (!enabledRef.current || !foreground.current || touching.current || debounceTimer.current || activeRequest.current) return;
      const now = Date.now();
      if (retryAt.current ? now >= retryAt.current : now - lastSuccessAt.current >= WEATHER_TTL_MS) {
        scheduleFetch(pendingTarget.current);
      }
    };
    const timer = setInterval(refresh, 1_000);
    const subscription = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      if (foreground.current) refresh();
      else {
        activeRequest.current?.abort();
        activeRequest.current = undefined;
        activeRequestPoint.current = undefined;
        requestGeneration.current += 1;
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = undefined;
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      activeRequest.current?.abort();
      requestGeneration.current += 1;
    };
  }, [scheduleFetch]);

  return {
    error,
    onCameraChanging,
    onCameraDidChange,
    onTouchEnd,
    onTouchStart,
    weather,
  };
}
