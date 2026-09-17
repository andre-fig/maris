import { useMemo } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";

import type { CurrentWeather } from "../weather/current-weather";
import { WeatherPanel } from "./WeatherPanel";
import { useFadeVisibility } from './use-fade-visibility';

type ScaleDefinition = {
  segmentMetres: number;
  segments: number;
  unit: "m" | "NM";
};

type ScaleRulerProps = {
  latitude: number;
  maxWidth: number;
  viewportWidth: number;
  visible: boolean;
  weather?: CurrentWeather;
  zoom: number;
};

const METRES_PER_PIXEL_AT_EQUATOR = 156543.03392;
const MAX_SCALE_METRES = 1_500_000;
const MAX_VISIBLE_SCALE_METRES = 1_000_000;
const MIN_ACTIVATION_RATIO = 1.2;
const WEATHER_MAX_SCALE_METRES = 10_000;
const SYSTEM_FONT = Platform.select({ ios: "System", default: "sans-serif" });

const METRE_SCALES: ScaleDefinition[] = [
  { segmentMetres: 2, segments: 3, unit: "m" },
  { segmentMetres: 5, segments: 2, unit: "m" },
  { segmentMetres: 12, segments: 1, unit: "m" },
  { segmentMetres: 5, segments: 3, unit: "m" },
  { segmentMetres: 12, segments: 2, unit: "m" },
  { segmentMetres: 12, segments: 3, unit: "m" },
  { segmentMetres: 25, segments: 2, unit: "m" },
  { segmentMetres: 25, segments: 3, unit: "m" },
  { segmentMetres: 50, segments: 2, unit: "m" },
  { segmentMetres: 125, segments: 1, unit: "m" },
  { segmentMetres: 50, segments: 3, unit: "m" },
  { segmentMetres: 125, segments: 2, unit: "m" },
  { segmentMetres: 125, segments: 3, unit: "m" },
  { segmentMetres: 250, segments: 2, unit: "m" },
  { segmentMetres: 250, segments: 3, unit: "m" },
];

const METRES_PER_NAUTICAL_MILE = 1_852;
const NAUTICAL_MILE_SCALES: ScaleDefinition[] = [
  [0.5, 1], [0.5, 2], [0.5, 3], [1, 2], [1, 3],
  [2.5, 2], [5, 2], [5, 3], [10, 2], [10, 3],
  [25, 2], [25, 3], [50, 2], [50, 3], [100, 2],
  [100, 3], [250, 2], [250, 3],
].map(([segmentNauticalMiles, segments]) => ({
  segmentMetres: segmentNauticalMiles * METRES_PER_NAUTICAL_MILE,
  segments,
  unit: "NM",
}));

const SCALES = [...METRE_SCALES, ...NAUTICAL_MILE_SCALES].filter(
  ({ segmentMetres, segments }) => segmentMetres * segments <= MAX_SCALE_METRES,
);

const LAST_VISIBLE_SCALE =
  [...SCALES]
    .reverse()
    .find(
      ({ segmentMetres, segments }) =>
        segmentMetres * segments <= MAX_VISIBLE_SCALE_METRES,
    ) ?? SCALES[0];

const SCALE_STEPS = SCALES.reduce<
  Array<{ activationMetres: number; scale: ScaleDefinition }>
>((steps, scale) => {
  const totalMetres = scale.segmentMetres * scale.segments;
  const previousActivation = steps.at(-1)?.activationMetres ?? 0;

  steps.push({
    activationMetres: Math.max(
      totalMetres,
      previousActivation * MIN_ACTIVATION_RATIO,
    ),
    scale,
  });

  return steps;
}, []);

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

function selectScale(maxMetres: number) {
  return (
    [...SCALE_STEPS]
      .reverse()
      .find(({ activationMetres }) => activationMetres <= maxMetres)?.scale ??
    SCALE_STEPS[0].scale
  );
}

export function getScaleUnit(latitude: number, maxWidth: number, zoom: number): ScaleDefinition["unit"] {
  const metresPerPoint =
    (METRES_PER_PIXEL_AT_EQUATOR * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return selectScale(metresPerPoint * maxWidth).unit;
}

export function isWeatherScaleVisible(
  latitude: number,
  maxWidth: number,
  zoom: number,
) {
  const metresPerPoint =
    (METRES_PER_PIXEL_AT_EQUATOR * Math.cos((latitude * Math.PI) / 180)) /
    2 ** zoom;
  const scale = selectScale(metresPerPoint * maxWidth);
  return scale.segmentMetres * scale.segments <= WEATHER_MAX_SCALE_METRES;
}

function formatValue(valueMetres: number, unit: ScaleDefinition["unit"]) {
  const value = unit === "NM" ? valueMetres / METRES_PER_NAUTICAL_MILE : valueMetres;
  return numberFormatter.format(value);
}

export function ScaleRuler({
  latitude,
  maxWidth,
  viewportWidth,
  visible,
  weather,
  zoom,
}: ScaleRulerProps) {
  const { hidden, labels, segments, showWeather, width } = useMemo(() => {
    const metresPerPoint =
      (METRES_PER_PIXEL_AT_EQUATOR * Math.cos((latitude * Math.PI) / 180)) /
      2 ** zoom;
    const selectedScale = selectScale(metresPerPoint * maxWidth);
    const selectedTotalMetres =
      selectedScale.segmentMetres * selectedScale.segments;
    const hidden = selectedTotalMetres > MAX_VISIBLE_SCALE_METRES;
    const scale = hidden ? LAST_VISIBLE_SCALE : selectedScale;
    const totalMetres = scale.segmentMetres * scale.segments;
    const values = Array.from(
      { length: scale.segments + 1 },
      (_, index) => index * scale.segmentMetres,
    );

    return {
      hidden,
      labels: values.map((value, index) => {
        const formatted = formatValue(value, scale.unit);
        return index === values.length - 1 ? `${formatted}${scale.unit === "m" ? "m" : " NM"}` : formatted;
      }),
      segments: scale.segments,
      showWeather: isWeatherScaleVisible(latitude, maxWidth, zoom),
      width: Math.min(maxWidth, totalMetres / metresPerPoint),
    };
  }, [latitude, maxWidth, zoom]);
  const showImmediately = visible && !hidden;

  const { opacity } = useFadeVisibility(showImmediately);

  return (
    <View style={[styles.container, { width: viewportWidth }]}>
      <WeatherPanel
        style={styles.weatherBadge}
        visible={showWeather}
        weather={weather}
      />
      <Animated.View
        style={[
          styles.rulerContainer,
          {
            left: (viewportWidth - width) / 2,
            opacity: showImmediately ? 1 : opacity,
            width,
          },
        ]}
      >
        <View style={styles.ruler}>
          <View style={styles.labels}>
            {labels.map((label) => (
              <View key={label}>
                <Text style={[styles.label, styles.labelOutline]}>{label}</Text>
                <Text style={styles.label}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.bar}>
            {Array.from({ length: segments }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.segment,
                  index % 2 === 0 ? styles.segmentLight : styles.segmentDark,
                ]}
              />
            ))}
            {Array.from({ length: segments - 1 }, (_, index) => (
              <View
                key={`divider-${index}`}
                style={[
                  styles.segmentDivider,
                  { left: `${((index + 1) / segments) * 100}%` },
                ]}
              />
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 32,
  },
  rulerContainer: {
    position: "absolute",
    top: 0,
  },
  weatherBadge: {
    top: 0,
    left: 38,
  },
  ruler: {
    height: 26,
  },
  labels: {
    height: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  label: {
    color: "#ffffff",
    fontFamily: SYSTEM_FONT,
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  labelOutline: {
    position: "absolute",
    color: "#000000",
    textShadowColor: "#000000",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2.5,
  },
  bar: {
    height: 7,
    flexDirection: "row",
    overflow: "hidden",
    backgroundColor: "#7fa9a1",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 3.5,
  },
  segment: {
    flex: 1,
  },
  segmentLight: {
    backgroundColor: "#7fa9a1",
  },
  segmentDark: {
    backgroundColor: "#28403e",
  },
  segmentDivider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#000000",
  },
});
