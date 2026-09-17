import { SymbolView } from "expo-symbols";
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import type { CurrentWeather } from "../weather/current-weather";
import {
  getAndroidWeatherSymbol,
  iosWeatherIcons,
  openWeatherIconMap,
} from "../weather/weather-icons";
import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";
import { BlurText } from "./BlurText";
import { useFadeVisibility } from "./use-fade-visibility";

type WeatherPanelProps = {
  weather?: CurrentWeather;
  visible: boolean;
  style?: StyleProp<ViewStyle>;
};

export function WeatherPanel({ weather, visible, style }: WeatherPanelProps) {
  const displayWeather = visible && weather !== undefined;
  const { mounted, opacity } = useFadeVisibility(displayWeather);
  const weatherIcon = weather
    ? openWeatherIconMap[weather.icon_code]
    : undefined;

  if (!mounted) return null;
  return (
    <Animated.View style={[{ opacity }, style]}>
      <BlurPanel
        key={displayWeather ? "weather-blur-visible" : "weather-blur-hidden"}
        flexDirection="row"
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
              accessibilityLabel={`Chance de chuva na próxima hora: ${Math.round(weather.rain_probability_percent)} por cento`}
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
                )} graus, umidade ${weather.humidity_percent} por cento, vento ${weather.wind_speed_metres_per_second} metros por segundo, precipitação ${weather.precipitation_millimetres_last_hour} milímetros na última hora`
              : undefined
          }
        >
          {weather ? `${Math.round(weather.temperature_celsius)}°` : ""}
        </BlurText>
      </BlurPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  condition: { minWidth: 20, alignItems: "center" },
  rainChance: {
    alignSelf: "stretch",
    textAlign: "center",
    transform: [{ translateX: 2 }],
    color: "#8ED8FF",
    fontSize: 10,
    lineHeight: 10,
  },
});
