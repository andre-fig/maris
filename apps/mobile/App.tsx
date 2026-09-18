import {
  Camera,
  type CameraRef,
  type MapRef,
  Layer,
  Map,
  OfflineManager,
  VectorSource,
} from "@maplibre/maplibre-react-native";
import { useEffect, useRef, useState } from "react";
import { useSharedValue } from "react-native-reanimated";
import { useCameraEvents } from "./map/use-camera-events";
import { isWithinChartBounds } from "./map/chart-bounds";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { isWeatherScaleVisible, ScaleRuler } from "./components/ScaleRuler";
import { CompassPanel } from "./components/CompassPanel";
import { BlurBottomSheet } from "./components/BlurBottomSheet";
import { BlurText } from "./components/BlurText";
import { UserLocationMarker } from "./components/UserLocationMarker";
import {
  MapControlsPanel,
  type MapStyleMode,
} from "./components/MapControlsPanel";
import { WindPanel } from "./components/WindPanel";
import { DrawerCompass } from "./components/DrawerCompass";
import { windLegendBand } from "./components/wind-legend-band";
import { useDeviceLocation } from "./location/use-device-location";
import { NativeWindLayer } from "@maris/native-wind";
import { MAP_AMBIENT_CACHE_BYTES } from "./offline/offline-areas";
import { useAutomaticOffline } from "./offline/use-automatic-offline";
import { DEFAULT_MAP_ZOOM } from "./map-config";
import { useChartInformation, useOnlineChart } from "./charts/current-chart";
import { chartInformationRows } from "./charts/chart-information";
import {
  type MapCenter,
  useCurrentViewportWeather,
} from "./weather/current-weather";

const BASE_MAP_STYLE = "https://tiles.openfreemap.org/styles/bright";
const LIBERTY_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const GOOGLE_SATELLITE_STYLE = JSON.stringify({
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    "google-satellite": {
      type: "raster",
      tiles: [
        "https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        "https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        "https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: "google-satellite",
      type: "raster",
      source: "google-satellite",
    },
  ],
});
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://api-production-7dc7.up.railway.app";
const LOCATION_MATCH_THRESHOLD_KM = 0.08;
type SheetContent = "chart" | "empty";

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
  const compassMapBearing = useSharedValue(0);
  const unavailableHeading = useSharedValue<number | null>(null);
  const mapRef = useRef<MapRef>(null);
  const {
    ready: offlineReady,
    area: offlineArea,
    onViewportSettled,
  } = useAutomaticOffline(mapRef, API_URL, BASE_MAP_STYLE);
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
  const [mapStyleMode, setMapStyleMode] = useState<
    MapStyleMode | "initial"
  >("initial");
  const [windEnabled, setWindEnabled] = useState(false);
  const [mapSheetVisible, setMapSheetVisible] = useState(false);
  const [chartRequested, setChartRequested] = useState(false);
  const chartRequestPending = useRef(false);
  const [sheetContent, setSheetContent] = useState<SheetContent>("chart");
  const [mapSheetCloseSignal, setMapSheetCloseSignal] = useState(0);
  const [centerWindSpeed, setCenterWindSpeed] = useState<number | null>(null);
  const [windSampleCoordinate, setWindSampleCoordinate] = useState<MapCenter | null>(null);
  const locationTarget = useRef(false);
  const initialLocationApplied = useRef(false);
  const courseUpTransitionPending = useRef(false);
  const onlineChart = useOnlineChart(API_URL, offlineReady && !offlineArea);
  const displayedChart = offlineArea?.chart ?? onlineChart;
  const mapButtonVisible = isWithinChartBounds(displayedChart?.bounds, viewState.longitude, viewState.latitude);
  const chartInformation = useChartInformation(API_URL, mapRef,
    chartRequested && mapButtonVisible && sheetContent === "chart", displayedChart?.version,
    viewState.longitude, viewState.latitude);
  const chartRows = chartInformation.chart ? chartInformationRows(chartInformation.chart) : [];

  useEffect(() => {
    if (!mapButtonVisible && chartRequested) {
      chartRequestPending.current = false;
      setChartRequested(false);
      if (sheetContent === "chart") setMapSheetVisible(false);
    }
  }, [mapButtonVisible, chartRequested, sheetContent]);

  useEffect(() => {
    if (chartRequested && chartInformation.ready && sheetContent === "chart") {
      chartRequestPending.current = false;
      setMapSheetVisible(true);
    }
  }, [chartRequested, chartInformation.ready, sheetContent]);

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
      zoom: lastZoom.current,
      bearing: deviceLocation.heading,
    });
  }, [
    courseUp,
    deviceLocation?.heading,
    deviceLocation?.coordinate[0],
    deviceLocation?.coordinate[1],
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

  const cameraEvents = useCameraEvents((view, settled) => {
    const zoomChanged = Math.abs(view.zoom - lastZoom.current) > 0.0001;
    lastZoom.current = view.zoom;
    if (settled) setIsZooming(false);
    else if (zoomChanged) setIsZooming(true);

    if (deviceLocation) {
      const atLocation = distanceKm(view.center, deviceLocation.coordinate) <= LOCATION_MATCH_THRESHOLD_KM;
      if (settled) {
        locationTarget.current = false;
        setLocationActive(atLocation);
      } else if (!locationTarget.current && !atLocation) {
        setLocationActive(false);
        setCourseUp(false);
      }
    }
    setViewState(previous => previous.longitude === view.center[0] &&
      previous.latitude === view.center[1] && previous.zoom === view.zoom &&
      previous.bearing === view.bearing ? previous : {
        longitude: view.center[0], latitude: view.center[1], zoom: view.zoom, bearing: view.bearing,
      });
    if (windEnabled) setWindSampleCoordinate(previous =>
      previous?.[0] === view.center[0] && previous?.[1] === view.center[1] ? previous : [...view.center]);
    if (settled) {
      currentWeather.onCameraDidChange(view.center);
      void onViewportSettled().catch(() => {});
    } else currentWeather.onCameraChanging(view.center);
  }, (view) => { compassMapBearing.value = view.bearing; });

  if (!offlineReady || (!deviceLocation && !offlineArea)) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={
          mapStyleMode === "satellite"
            ? GOOGLE_SATELLITE_STYLE
            : mapStyleMode === "liberty"
              ? LIBERTY_MAP_STYLE
              : mapStyleMode === "bright"
                ? BASE_MAP_STYLE
                : offlineArea
              ? JSON.stringify(offlineArea.baseStyle)
              : BASE_MAP_STYLE
        }
        logo={false}
        attribution={false}
        compass={false}
        scaleBar={false}
        touchZoom
        touchRotate
        touchPitch={false}
        onDidFinishLoadingMap={() => { void onViewportSettled().catch(() => {}); }}
        onTouchStart={() => {
          currentWeather.onTouchStart();
          if (mapSheetVisible) setMapSheetCloseSignal((signal) => signal + 1);
        }}
        onTouchEnd={({ nativeEvent }) => {
          currentWeather.onTouchEnd(nativeEvent.touches.length);
        }}
        onRegionIsChanging={cameraEvents.onRegionIsChanging}
        onRegionDidChange={cameraEvents.onRegionDidChange}
      >
        {mapStyleMode !== "satellite" ? (
          <Layer
            id="poi_transit"
            type="symbol"
            source="openmaptiles"
            source-layer="poi"
            filter={["match", ["get", "class"], ["airport", "rail"], true, false]}
          />
        ) : null}
        <Camera
          ref={cameraRef}
          key="gps-camera"
          initialViewState={{
            center: deviceLocation?.coordinate ?? [(offlineArea!.bounds[0]+offlineArea!.bounds[2])/2,(offlineArea!.bounds[1]+offlineArea!.bounds[3])/2],
            zoom: offlineArea ? Math.min(offlineArea.maxZoom,Math.max(offlineArea.minZoom,DEFAULT_MAP_ZOOM)) : DEFAULT_MAP_ZOOM,
          }}
        />
        {displayedChart ? <VectorSource
          key={displayedChart.version}
          id="miami-soundg"
          tiles={displayedChart.tiles}
          minzoom={displayedChart.minzoom}
          maxzoom={displayedChart.maxzoom}
        >
          <Layer
            id="miami-soundg-depth"
            type="symbol"
            source-layer="soundings"
            beforeId={
              mapStyleMode !== "satellite"
                ? "water_name_point_label"
                : undefined
            }
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
        </VectorSource> : null}
        {deviceLocation ? (
          <UserLocationMarker
            coordinate={deviceLocation.coordinate}
            heading={deviceLocation.heading}
            mapBearing={viewState.bearing}
            courseUp={courseUp}
          />
        ) : null}
      </Map>
      <NativeWindLayer
        enabled={windEnabled}
        opacity={0.8}
        density={0.75}
        animationSpeed={1}
        sampleCoordinate={windEnabled ? windSampleCoordinate : null}
        onCenterWind={({ nativeEvent }) => {
          if (windEnabled && windSampleCoordinate &&
              nativeEvent.coordinate[0] === windSampleCoordinate[0] &&
              nativeEvent.coordinate[1] === windSampleCoordinate[1]) {
            setCenterWindSpeed(previous =>
              windLegendBand(previous) === windLegendBand(nativeEvent.speed)
                ? previous : nativeEvent.speed);
          }
        }}
        style={{ width: 0, height: 0, position: "absolute" }}
      />
      <View pointerEvents="box-none" style={styles.scaleOverlay}>
        <ScaleRuler
          latitude={viewState.latitude}
          maxWidth={scaleMaxWidth}
          viewportWidth={width}
          visible={isZooming}
          weather={currentWeather.weather}
          zoom={viewState.zoom}
        />
      </View>
      <View pointerEvents="box-none" style={styles.controlsOverlay}>
        <View pointerEvents="box-none" style={styles.controlsStack}>
          <CompassPanel
            heading={deviceLocation?.heading ?? null}
            mapBearingValue={compassMapBearing}
            onPress={() => {
              if (Math.abs(viewState.bearing) < 0.001) {
                chartRequestPending.current = false;
                setChartRequested(false);
                setSheetContent("empty");
                setMapSheetVisible(true);
                return;
              }
              setSheetContent("chart");
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
            onMapModeChange={setMapStyleMode}
            showMapButton={mapButtonVisible}
            mapLoading={chartRequested && chartInformation.loading && !mapSheetVisible}
            onMapPress={() => {
              if (!mapButtonVisible || chartRequestPending.current || (mapSheetVisible && sheetContent === "chart")) return;
              chartRequestPending.current = true;
              setMapSheetVisible(false);
              setSheetContent("chart");
              setChartRequested(true);
            }}
            onLocate={() => {
              if (!deviceLocation) return;
              locationTarget.current = true;
              // Selecting the mode must not depend on a sensor sample already
              // being available. The effect waits for heading (including 0°).
              const shouldEnableCourseUp = locationActive;
              const canAlignHeading =
                shouldEnableCourseUp && deviceLocation.heading !== null;
              // Skip the heading effect only when course-up is actually being
              // enabled now. Re-selecting an already active mode must keep
              // following the next heading sample.
              courseUpTransitionPending.current = canAlignHeading && !courseUp;
              cameraRef.current?.flyTo({
                center: deviceLocation.coordinate,
                zoom: shouldEnableCourseUp ? viewState.zoom : DEFAULT_MAP_ZOOM,
                ...(canAlignHeading
                  ? { bearing: deviceLocation.heading! }
                  : {}),
                duration: 500,
              });
              setLocationActive(true);
              setCourseUp(shouldEnableCourseUp);
            }}
          />
        </View>
      </View>
      <View pointerEvents="box-none" style={styles.windOverlay}>
        <WindPanel
          enabled={windEnabled}
          centerWindSpeed={centerWindSpeed}
          currentWindSpeed={currentWeather.windSpeed}
          onToggle={() => {
            setCenterWindSpeed(null);
            setWindSampleCoordinate([viewState.longitude, viewState.latitude]);
            setWindEnabled((enabled) => !enabled);
          }}
        />
      </View>
      <BlurBottomSheet
        visible={mapSheetVisible}
        closeSignal={mapSheetCloseSignal}
        onClose={() => {
          chartRequestPending.current = false;
          setChartRequested(false);
          setMapSheetVisible(false);
        }}
      >
        {sheetContent === "chart" ? (
          <>
            <BlurText style={styles.sheetTitle}>Chart information</BlurText>
            <ScrollView
              style={styles.chartInfoList}
              contentContainerStyle={styles.chartInfoContent}
              showsVerticalScrollIndicator
              persistentScrollbar
            >
              {chartInformation.message ? <BlurText style={styles.chartInfoMessage}>{chartInformation.message}</BlurText> : null}
              {chartRows.map(([label, value], index) => (
                <View key={label} style={styles.chartInfoRow}>
                  <BlurText style={styles.chartInfoLabel}>{label}</BlurText>
                  <BlurText style={styles.chartInfoValue}>{value}</BlurText>
                  {index < chartRows.length - 1 ? (
                    <View style={styles.chartInfoDivider} />
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </>
        ) : (
          <DrawerCompass headingValue={deviceLocation?.headingValue ?? unavailableHeading} />
        )}
      </BlurBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    marginBottom: 10,
  },
  chartInfoList: {
    maxHeight: 520,
    marginRight: -20,
  },
  chartInfoContent: {
    paddingBottom: 4,
    paddingRight: 20,
  },
  chartInfoRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    position: "relative",
  },
  chartInfoLabel: {
    flex: 0.9,
    color: "rgba(255, 255, 255, 0.62)",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  chartInfoMessage: {
    fontSize: 14,
    lineHeight: 19,
    textAlign: "left",
    alignSelf: "stretch",
  },
  chartInfoValue: {
    flex: 1.1,
    fontSize: 14,
    lineHeight: 19,
    textAlign: "right",
  },
  chartInfoDivider: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
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
    zIndex: 1,
    elevation: 1,
  },
  controlsOverlay: {
    position: "absolute",
    // Keep the containing block independent of the animated legend width.
    // Otherwise its intrinsic width and the child's right alignment can settle
    // in separate layout passes during expansion.
    left: 38,
    right: 38,
    bottom: 48,
    zIndex: 2,
    elevation: 2,
  },
  controlsStack: {
    alignItems: "flex-end",
    gap: 8,
  },
  windOverlay: {
    position: "absolute",
    top: 64,
    right: 38,
    zIndex: 3,
    elevation: 3,
  },
});
