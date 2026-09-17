import {
  Camera,
  type CameraRef,
  Layer,
  Map,
  OfflineManager,
  VectorSource,
} from "@maplibre/maplibre-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { isWeatherScaleVisible, ScaleRuler } from "./components/ScaleRuler";
import { CompassPanel } from "./components/CompassPanel";
import { UserLocationMarker } from "./components/UserLocationMarker";
import { MapControlsPanel } from "./components/MapControlsPanel";
import { WindPanel } from "./components/WindPanel";
import { useDeviceLocation } from "./location/use-device-location";
import { NativeWindLayer } from "@maris/native-wind";
import { MAP_AMBIENT_CACHE_BYTES } from "./offline/offline-areas";
import {
  type MapCenter,
  useCurrentViewportWeather,
} from "./weather/current-weather";

const BASE_MAP_STYLE = "https://tiles.openfreemap.org/styles/bright";
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://api-production-7dc7.up.railway.app";
const DEFAULT_MAP_ZOOM = 14;
const LOCATION_MATCH_THRESHOLD_KM = 0.08;

function distanceKm(a: [number, number], b: [number, number]) {
  const [longitudeA, latitudeA] = a;
  const [longitudeB, latitudeB] = b;
  const latitudeDelta = ((latitudeB - latitudeA) * Math.PI) / 180;
  const longitudeDelta = ((longitudeB - longitudeA) * Math.PI) / 180;
  const meanLatitude = (((latitudeA + latitudeB) / 2) * Math.PI) / 180;
  const x = longitudeDelta * Math.cos(meanLatitude);
  const y = latitudeDelta;
  return Math.sqrt(x * x + y * y) * 6_371;
}

export default function App() {
  const { width } = useWindowDimensions();
  const deviceLocation = useDeviceLocation();
  const initialCenter: MapCenter = deviceLocation?.coordinate ?? [0, 0];
  const [viewState, setViewState] = useState({
    longitude: initialCenter[0],
    latitude: initialCenter[1],
    zoom: DEFAULT_MAP_ZOOM,
    bearing: 0,
  });
  const [isZooming, setIsZooming] = useState(false);
  const lastZoom = useRef(DEFAULT_MAP_ZOOM);
  const cameraRef = useRef<CameraRef>(null);
  const [locationActive, setLocationActive] = useState(false);
  const [courseUp, setCourseUp] = useState(false);
  const [windEnabled, setWindEnabled] = useState(false);
  const locationTarget = useRef(false);
  const initialLocationApplied = useRef(false);
  const courseUpTransitionPending = useRef(false);

  useEffect(() => {
    if (deviceLocation && !initialLocationApplied.current) {
      initialLocationApplied.current = true;
      setLocationActive(true);
    }
  }, [deviceLocation]);

  useEffect(() => {
    if (
      !courseUp ||
      deviceLocation?.heading === null ||
      deviceLocation?.heading === undefined
    ) {
      return;
    }

    if (courseUpTransitionPending.current) {
      courseUpTransitionPending.current = false;
      return;
    }

    cameraRef.current?.jumpTo({
      center: deviceLocation.coordinate,
      zoom: viewState.zoom,
      bearing: deviceLocation.heading,
    });
  }, [
    courseUp,
    deviceLocation?.heading,
    deviceLocation?.coordinate,
    viewState.zoom,
  ]);

  const scaleMaxWidth = Math.min(width - 96, 175);
  const currentWeather = useCurrentViewportWeather(
    API_URL,
    initialCenter,
    Boolean(deviceLocation) &&
      isWeatherScaleVisible(viewState.latitude, scaleMaxWidth, viewState.zoom),
  );

  useEffect(() => {
    void OfflineManager.setMaximumAmbientCacheSize(MAP_AMBIENT_CACHE_BYTES);
  }, []);

  if (!deviceLocation) {
    return <View style={styles.container} />;
  }

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
        onTouchStart={currentWeather.onTouchStart}
        onTouchEnd={({ nativeEvent }) => {
          currentWeather.onTouchEnd(nativeEvent.touches.length);
        }}
        onRegionIsChanging={({ nativeEvent }) => {
          if (Math.abs(nativeEvent.zoom - lastZoom.current) > 0.0001) {
            setIsZooming(true);
          }

          lastZoom.current = nativeEvent.zoom;
          if (
            !locationTarget.current &&
            deviceLocation &&
            distanceKm(nativeEvent.center, deviceLocation.coordinate) >
              LOCATION_MATCH_THRESHOLD_KM
          ) {
            setLocationActive(false);
            setCourseUp(false);
          }
          setViewState({
            longitude: nativeEvent.center[0],
            latitude: nativeEvent.center[1],
            zoom: nativeEvent.zoom,
            bearing: nativeEvent.bearing,
          });
          currentWeather.onCameraChanging(nativeEvent.center);
        }}
        onRegionDidChange={({ nativeEvent }) => {
          lastZoom.current = nativeEvent.zoom;
          if (deviceLocation) {
            const isAtLocation =
              distanceKm(nativeEvent.center, deviceLocation.coordinate) <=
              LOCATION_MATCH_THRESHOLD_KM;
            locationTarget.current = false;
            setLocationActive(isAtLocation);
          }
          setViewState({
            longitude: nativeEvent.center[0],
            latitude: nativeEvent.center[1],
            zoom: nativeEvent.zoom,
            bearing: nativeEvent.bearing,
          });
          currentWeather.onCameraDidChange(nativeEvent.center);
          setIsZooming(false);
        }}
      >
        <Camera
          ref={cameraRef}
          key="gps-camera"
          initialViewState={{
            center: deviceLocation.coordinate,
            zoom: DEFAULT_MAP_ZOOM,
          }}
        />
        <VectorSource id="miami-soundg" url={`${API_URL}/tiles/soundg.json`}>
          <Layer
            id="miami-soundg-depth"
            type="symbol"
            source-layer="soundings"
            beforeId="water_name_point_label"
            minzoom={10}
            layout={{
              "text-field": ["to-string", ["get", "DEPTH"]],
              "text-font": ["Noto Sans Regular"],
              "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 12],
              "text-padding": 1,
            }}
            paint={{
              "text-color": "#173f4d",
              "text-halo-color": "#dceef3",
              "text-halo-width": 1,
            }}
          />
        </VectorSource>
        {deviceLocation ? (
          <UserLocationMarker
            coordinate={deviceLocation.coordinate}
            heading={deviceLocation.heading}
            mapBearing={viewState.bearing}
          />
        ) : null}
      </Map>
      <NativeWindLayer
        enabled={windEnabled}
        opacity={0.8}
        density={0.75}
        animationSpeed={1}
        style={{ width: 0, height: 0, position: "absolute" }}
      />
      <View style={styles.controlsOverlay}>
        <View style={styles.controlsStack}>
          <WindPanel
            enabled={windEnabled}
            onToggle={() => setWindEnabled((enabled) => !enabled)}
          />
          <CompassPanel
            heading={deviceLocation.heading}
            onPress={() => {
              locationTarget.current = false;
              setCourseUp(false);
              cameraRef.current?.flyTo({
                center: [viewState.longitude, viewState.latitude],
                zoom: viewState.zoom,
                bearing: 0,
                duration: 500,
              });
            }}
          />
          <MapControlsPanel
            locationActive={locationActive}
            courseUp={courseUp}
            onLocate={() => {
              if (!deviceLocation) return;
              locationTarget.current = true;
              const shouldEnableCourseUp =
                locationActive && deviceLocation.heading !== null;
              courseUpTransitionPending.current = shouldEnableCourseUp;
              cameraRef.current?.flyTo({
                center: deviceLocation.coordinate,
                zoom: shouldEnableCourseUp ? viewState.zoom : DEFAULT_MAP_ZOOM,
                ...(shouldEnableCourseUp
                  ? { bearing: deviceLocation.heading ?? 0 }
                  : {}),
                duration: 500,
              });
              setLocationActive(true);
              setCourseUp(shouldEnableCourseUp);
            }}
          />
        </View>
      </View>
      <View pointerEvents="none" style={styles.scaleOverlay}>
        <ScaleRuler
          latitude={viewState.latitude}
          maxWidth={scaleMaxWidth}
          viewportWidth={width}
          visible={isZooming}
          weather={currentWeather.weather}
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
    position: "absolute",
    top: 64,
    right: 0,
    left: 0,
    alignItems: "center",
  },
  controlsOverlay: {
    position: "absolute",
    right: 38,
    bottom: 48,
  },
  controlsStack: {
    alignItems: "flex-end",
    gap: 8,
  },
});
