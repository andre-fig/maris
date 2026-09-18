import { SymbolView } from "expo-symbols";
import { StyleSheet, View } from "react-native";

import type { CurrentWeather } from "../weather/current-weather";
import {
  getAndroidWeatherSymbol,
  iosWeatherIcons,
  openWeatherIconMap,
} from "../weather/weather-icons";
import { BlurPanel } from "./BlurPanel";
import { BlurText } from "./BlurText";
import { LoadingIcon } from "./LoadingIcon";
import { METRES_PER_SECOND_TO_KNOTS } from "./wind-legend-band";

export type DataPanelItem = {
  label: string;
  value: string;
  unit: string;
  iosIcon: string;
  androidIcon: string;
  loading?: boolean;
};

const NAVIGATION_DATA: DataPanelItem[] = [
  { label: "SOG", value: "8.4", unit: "kt", iosIcon: "gauge.open.with.lines.needle.33percent", androidIcon: "speed_2" },
  { label: "COG", value: "132°", unit: "", iosIcon: "location.north", androidIcon: "navigation" },
  { label: "Heading", value: "128°", unit: "", iosIcon: "location.north.line", androidIcon: "near_me" },
  { label: "Depth", value: "12.6", unit: "m", iosIcon: "water.waves", androidIcon: "waves" },
  { label: "Draft", value: "1.7", unit: "m", iosIcon: "arrow.down.to.line", androidIcon: "vertical-align-bottom" },
  { label: "UKC", value: "10.9", unit: "m", iosIcon: "arrow.up.and.down", androidIcon: "height" },
];

const WEATHER_CONDITIONS_DATA: DataPanelItem[] = [
  { label: "Weather", value: "—", unit: "C", iosIcon: "cloud", androidIcon: "cloud" },
  { label: "Rain", value: "—", unit: "", iosIcon: "drop", androidIcon: "water_drop" },
  ...NAVIGATION_DATA.slice(2, -1),
  { label: "Wind", value: "8.4", unit: "kt", iosIcon: "wind", androidIcon: "air" },
];

export function NavigationDataPanel() {
  return <DataMetricsPanel items={NAVIGATION_DATA} />;
}

export function WeatherConditionsPanel({
  weather,
  windSpeed,
  windLoading,
}: {
  weather?: CurrentWeather;
  windSpeed?: number | null;
  windLoading: boolean;
}) {
  const weatherIcon = weather
    ? openWeatherIconMap[weather.icon_code]
    : undefined;
  const weatherItem = {
    ...WEATHER_CONDITIONS_DATA[0],
    value: weather ? `${Math.round(weather.temperature_celsius)}°` : "—",
    loading: !weather,
    iosIcon: weatherIcon ? iosWeatherIcons[weatherIcon] : "cloud",
    androidIcon: weatherIcon ? getAndroidWeatherSymbol(weatherIcon) : "cloud",
  };
  const precipitationItem = {
    ...WEATHER_CONDITIONS_DATA[1],
    value:
      typeof weather?.rain_probability_percent === "number" &&
      Number.isFinite(weather.rain_probability_percent)
        ? `${Math.round(weather.rain_probability_percent)}%`
        : "—",
    loading:
      typeof weather?.rain_probability_percent !== "number" ||
      !Number.isFinite(weather.rain_probability_percent),
  };
  const hasWindSpeed =
    typeof windSpeed === "number" && Number.isFinite(windSpeed) && windSpeed >= 0;
  const windValue = hasWindSpeed
    ? (windSpeed * METRES_PER_SECOND_TO_KNOTS).toFixed(1)
    : "—";
  const items = WEATHER_CONDITIONS_DATA.map((item, index) =>
    index === 0
      ? weatherItem
      : index === 1
      ? precipitationItem
      : item.label === "Wind"
      ? { ...item, value: windValue, loading: windLoading || !hasWindSpeed }
      : item,
  );

  return <DataMetricsPanel items={items} />;
}

function DataMetricsPanel({ items }: { items: DataPanelItem[] }) {
  return (
    <BlurPanel flexDirection="row" alignSelf="stretch" style={styles.panel}>
      {items.map((item, index) => (
        <View
          key={item.label}
          style={[styles.item, index < items.length - 1 && styles.divider]}
        >
          <SymbolView
            name={{ ios: item.iosIcon, android: item.androidIcon, web: item.androidIcon } as never}
            size={22}
            tintColor="#FFFFFF"
            type="hierarchical"
          />
          <BlurText style={styles.label} numberOfLines={1}>{item.label}</BlurText>
          <LoadingIcon loading={item.loading ?? false} size={22}>
            <BlurText style={styles.value} numberOfLines={1}>{item.value}</BlurText>
          </LoadingIcon>
          <BlurText style={styles.unit}>{item.unit || "\u00A0"}</BlurText>
        </View>
      ))}
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 0,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: 2,
  },
  divider: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.22)",
  },
  label: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 14,
  },
  value: {
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 22,
  },
  unit: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 14,
  },
});
