import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

import type { CurrentWeather } from "../weather/current-weather";
import {
  getAndroidWeatherSymbol,
  iosWeatherIcons,
  openWeatherIconMap,
} from "../weather/weather-icons";
import { BlurPanel } from "./BlurPanel";
import { BlurText } from "./BlurText";
import { useFadeVisibility } from "./use-fade-visibility";
import { usePanelTransition } from "./use-panel-transition";
import { METRES_PER_SECOND_TO_KNOTS } from "./wind-legend-band";

const CLOSED_HEIGHT = 44;
const MAX_FORECAST_ROWS = 6;

type WeatherPanelProps = {
  weather?: CurrentWeather;
  visible: boolean;
  style?: StyleProp<ViewStyle>;
};

export function WeatherPanel({ weather, visible, style }: WeatherPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [forecastHeight, setForecastHeight] = useState(0);
  const displayWeather = visible && weather !== undefined;
  const { mounted, opacity } = useFadeVisibility(displayWeather);
  const forecast = weather?.forecast?.slice(0, MAX_FORECAST_ROWS) ?? [];
  const hasForecast = forecast.length > 0;
  const expansion = usePanelTransition(expanded && hasForecast ? 1 : 0);
  const weatherIcon = weather ? openWeatherIconMap[weather.icon_code] : undefined;
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
        style={styles.panel}
      >
        <View pointerEvents="none" accessible={false} style={styles.measurementHost}>
          <View style={styles.headerMeasure}>
            <View style={styles.conditionMeasure} />
            <View style={styles.valueColumn}>
              <BlurText style={[styles.temperature, styles.measurementTemperature]}>00°</BlurText>
              <BlurText style={styles.nowLabel}>Now</BlurText>
            </View>
          </View>
          <View style={styles.forecastMeasure}>
            <View style={styles.conditionMeasure} />
            <View style={styles.valueColumn}>
              <BlurText style={[styles.temperature, styles.measurementTemperature]}>00°</BlurText>
              <BlurText style={styles.nowLabel}>00</BlurText>
            </View>
          </View>
        </View>
        <Animated.View
          style={[
            styles.content,
            {
              height: expansion.interpolate({
                inputRange: [0, 1],
                outputRange: [CLOSED_HEIGHT, CLOSED_HEIGHT + forecastHeight],
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
                <BlurText style={styles.rainChance}>
                  {Math.round(weather.rain_probability_percent)}%
                </BlurText>
              ) : null}
            </View>
            <View style={styles.valueColumn}>
              <BlurText style={[styles.temperature, styles.currentTemperature]}>
                {weather ? `${Math.round(weather.temperature_celsius)}°` : ""}
              </BlurText>
              <BlurText style={styles.nowLabel}>Now</BlurText>
            </View>
          </Pressable>
          <Animated.View
            pointerEvents={expanded ? "auto" : "none"}
            accessibilityElementsHidden={!expanded}
            importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
            onLayout={({ nativeEvent }) => {
              const height = Math.ceil(nativeEvent.layout.height);
              if (height !== forecastHeight) setForecastHeight(height);
            }}
            style={[styles.forecast, { opacity: expansion }]}
          >
            {forecast.map((hour) => {
              const hourIcon = openWeatherIconMap[hour.icon_code];
              return (
                <View key={hour.forecast_at} style={styles.forecastRow}>
                  <View style={styles.condition}>
                    {hourIcon ? (
                      <SymbolView
                        name={{
                          android: getAndroidWeatherSymbol(hourIcon),
                          ios: iosWeatherIcons[hourIcon],
                          web: getAndroidWeatherSymbol(hourIcon),
                        }}
                        size={20}
                        tintColor="#ffffff"
                        type="hierarchical"
                      />
                    ) : null}
                    <BlurText style={styles.rainChance}>
                      {Math.round(hour.rain_probability_percent)}%
                    </BlurText>
                  </View>
                  <View style={styles.valueColumn}>
                    <BlurText style={[styles.temperature, styles.forecastTemperature]}>
                      {Math.round(hour.temperature_celsius)}°
                    </BlurText>
                    <BlurText style={styles.nowLabel}>{formatHour(hour.forecast_at)}h</BlurText>
                  </View>
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
  return new Date(timestamp).getHours().toString().padStart(2, "0");
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 6, paddingVertical: 0, alignItems: "center", justifyContent: "center" },
  content: { flexShrink: 0, overflow: "hidden" },
  measurementHost: { position: "absolute", left: 0, top: 0, opacity: 0 },
  headerMeasure: { alignSelf: "flex-start", flexDirection: "column", alignItems: "center" },
  conditionMeasure: { width: 32, height: 30 },
  forecastMeasure: { alignSelf: "flex-start", flexDirection: "column", alignItems: "center" },
  header: { height: CLOSED_HEIGHT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1 },
  pressed: { opacity: 0.62, transform: [{ scale: 0.98 }] },
  condition: { width: 32, alignItems: "center" },
  nowLabel: { fontSize: 9, fontWeight: "400", lineHeight: 11 },
  rainChance: { alignSelf: "stretch", textAlign: "center", transform: [{ translateX: 2 }], color: "#8ED8FF", fontSize: 10, lineHeight: 10 },
  forecast: { position: "absolute", top: CLOSED_HEIGHT, right: 0, left: 0, gap: 8, paddingBottom: 4, paddingTop: 6 },
  forecastRow: { flexDirection: "row", alignItems: "center", gap: 1 },
  valueColumn: { alignItems: "center", justifyContent: "center", gap: 0 },
  temperature: { fontSize: 14, lineHeight: 18 },
  currentTemperature: {},
  measurementTemperature: {},
  forecastTemperature: {},
});
