import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import type { CurrentWeather } from "../weather/current-weather";
import {
  getAndroidWeatherSymbol,
  iosWeatherIcons,
  openWeatherIconMap,
} from "../weather/weather-icons";
import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";
import { BlurText } from "./BlurText";
import { useFadeVisibility } from "./use-fade-visibility";
import { usePanelTransition } from "./use-panel-transition";
import { METRES_PER_SECOND_TO_KNOTS } from "./wind-legend-band";

const CLOSED_HEIGHT = 32;
const FORECAST_ROW_HEIGHT = 22;
const MAX_FORECAST_ROWS = 8;

type WeatherPanelProps = {
  weather?: CurrentWeather;
  visible: boolean;
  style?: StyleProp<ViewStyle>;
};

export function WeatherPanel({ weather, visible, style }: WeatherPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [headerWidth, setHeaderWidth] = useState(0);
  const [forecastWidth, setForecastWidth] = useState(0);
  const displayWeather = visible && weather !== undefined;
  const { mounted, opacity } = useFadeVisibility(displayWeather);
  const forecast = weather?.forecast?.slice(0, MAX_FORECAST_ROWS) ?? [];
  const hasForecast = forecast.length > 0;
  const expansion = usePanelTransition(expanded && hasForecast ? 1 : 0);
  const expandedWidth = Math.max(headerWidth, forecastWidth);
  const weatherIcon = weather
    ? openWeatherIconMap[weather.icon_code]
    : undefined;
  const windSpeedInKnots = weather
    ? Math.round(weather.wind_speed_metres_per_second * METRES_PER_SECOND_TO_KNOTS * 10) / 10
    : undefined;

  useEffect(() => {
    if (!hasForecast && expanded) setExpanded(false);
  }, [expanded, hasForecast]);

  if (!mounted) return null;
  return (
    <Animated.View style={[{ opacity }, style]}>
      <BlurPanel
        key={displayWeather ? "weather-blur-visible" : "weather-blur-hidden"}
        flexDirection="column"
      >
        <View pointerEvents="none" accessible={false} style={styles.measurementHost}>
          <View style={styles.forecastMeasure} onLayout={({ nativeEvent }) => {
            const width = Math.ceil(nativeEvent.layout.width);
            if (width !== forecastWidth) setForecastWidth(width);
          }}>
            <BlurText style={styles.forecastTime}>00:00</BlurText>
            <View style={styles.forecastIconMeasure} />
            <BlurText style={styles.forecastTemperature}>00°</BlurText>
            <BlurText style={styles.forecastRain}>100%</BlurText>
          </View>
        </View>
        <Animated.View
          style={[
            styles.content,
            {
              width: headerWidth > 0
                ? expansion.interpolate({
                    inputRange: [0, 1],
                    outputRange: [headerWidth, expandedWidth],
                  })
                : undefined,
              height: expansion.interpolate({
                inputRange: [0, 1],
                outputRange: [CLOSED_HEIGHT, CLOSED_HEIGHT + forecast.length * FORECAST_ROW_HEIGHT],
              }),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasForecast ? (expanded ? "Hide weather forecast" : "Show weather forecast") : undefined}
            accessibilityState={{ expanded: hasForecast && expanded }}
            disabled={!hasForecast}
            onPress={hasForecast ? () => setExpanded((value) => !value) : undefined}
            onLayout={({ nativeEvent }) => {
              const width = Math.ceil(nativeEvent.layout.width);
              if (width !== headerWidth) setHeaderWidth(width);
            }}
            style={({ pressed }) => [styles.header, pressed && styles.pressed]}
          >
            <View style={styles.condition}>
              {weatherIcon ? (
                <SymbolView
                  name={{
                    android: getAndroidWeatherSymbol(weatherIcon),
                    ios: iosWeatherIcons[weatherIcon],
                    web: getAndroidWeatherSymbol(weatherIcon),
                  }}
                  size={20}
                  tintColor="#ffffff"
                  type="hierarchical"
                />
              ) : null}
              {typeof weather?.rain_probability_percent === "number" ? (
                <BlurText
                  style={styles.rainChance}
                  accessibilityLabel={`Chance of rain in the next hour: ${Math.round(weather.rain_probability_percent)} percent`}
                >
                  {Math.round(weather.rain_probability_percent)}%
                </BlurText>
              ) : null}
            </View>
            <BlurText
              accessibilityLabel={
                weather
                  ? `${weather.condition}, ${Math.round(
                      weather.temperature_celsius,
                    )} degrees, humidity ${weather.humidity_percent} percent, wind ${windSpeedInKnots} knots, precipitation ${weather.precipitation_millimetres_last_hour} millimetres in the last hour`
                  : undefined
              }
            >
              {weather ? `${Math.round(weather.temperature_celsius)}°` : ""}
            </BlurText>
          </Pressable>
          <Animated.View
            pointerEvents={expanded ? "auto" : "none"}
            accessibilityElementsHidden={!expanded}
            importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
            style={[styles.forecast, { opacity: expansion }]}
          >
            {forecast.map((hour) => {
              const hourIcon = openWeatherIconMap[hour.icon_code];
              return (
                <View key={hour.forecast_at} style={styles.forecastRow}>
                  <BlurText style={styles.forecastTime}>{formatHour(hour.forecast_at)}</BlurText>
                  {hourIcon ? (
                    <SymbolView
                      name={{
                        android: getAndroidWeatherSymbol(hourIcon),
                        ios: iosWeatherIcons[hourIcon],
                        web: getAndroidWeatherSymbol(hourIcon),
                      }}
                      size={16}
                      tintColor="#ffffff"
                      type="hierarchical"
                    />
                  ) : null}
                  <BlurText style={styles.forecastTemperature}>{Math.round(hour.temperature_celsius)}°</BlurText>
                  <BlurText style={styles.forecastRain}>{Math.round(hour.rain_probability_percent)}%</BlurText>
                </View>
              );
            })}
          </Animated.View>
        </Animated.View>
      </BlurPanel>
    </Animated.View>
  );
}

function formatHour(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

const styles = StyleSheet.create({
  content: { overflow: "hidden" },
  measurementHost: { position: "absolute", left: 0, top: 0, opacity: 0 },
  forecastMeasure: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  forecastIconMeasure: { width: 16, height: 16 },
  header: {
    height: CLOSED_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pressed: { opacity: 0.62, transform: [{ scale: 0.98 }] },
  condition: { minWidth: 20, alignItems: "center" },
  rainChance: {
    alignSelf: "stretch",
    textAlign: "center",
    transform: [{ translateX: 2 }],
    color: "#8ED8FF",
    fontSize: 10,
    lineHeight: 10,
  },
  forecast: { gap: 0 },
  forecastRow: {
    height: FORECAST_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  forecastTime: { width: 48, fontSize: 12, lineHeight: 18 },
  forecastTemperature: { width: 38, fontSize: 13, lineHeight: 18 },
  forecastRain: { marginLeft: "auto", color: "#8ED8FF", fontSize: 12, lineHeight: 18 },
});
