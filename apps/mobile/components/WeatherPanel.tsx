import { SymbolView } from "expo-symbols";
import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";

import type { CurrentWeather } from "../weather/current-weather";
import {
  getAndroidWeatherSymbol,
  iosWeatherIcons,
  openWeatherIconMap,
} from "../weather/weather-icons";
import { BlurPanel } from "./BlurPanel";

type WeatherPanelProps = {
  weather?: CurrentWeather;
  visible: boolean;
  style?: StyleProp<ViewStyle>;
};

const SYSTEM_FONT = Platform.select({ ios: "System", default: "sans-serif" });

export function WeatherPanel({ weather, visible, style }: WeatherPanelProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const displayWeather = visible && weather !== undefined;
  const weatherIcon = weather
    ? openWeatherIconMap[weather.icon_code]
    : undefined;

  useEffect(() => {
    opacity.stopAnimation();
    if (displayWeather) {
      opacity.setValue(1);
      return;
    }

    const fadeOut = Animated.timing(opacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    });
    fadeOut.start();
    return () => fadeOut.stop();
  }, [displayWeather, opacity]);

  return (
    <Animated.View style={[styles.wrapper, { opacity }, style]}>
      <BlurPanel
        key={displayWeather ? "weather-blur-visible" : "weather-blur-hidden"}
        style={styles.panel}
      >
        {weatherIcon ? (
          <SymbolView
            name={{
              android: getAndroidWeatherSymbol(weatherIcon),
              ios: iosWeatherIcons[weatherIcon],
              web: getAndroidWeatherSymbol(weatherIcon),
            }}
            size={20}
            style={styles.icon}
            tintColor="#ffffff"
            type="hierarchical"
          />
        ) : null}
        <Text
          accessibilityLabel={
            weather
              ? `${weather.condition}, ${Math.round(
                  weather.temperature_celsius,
                )} graus, umidade ${weather.humidity_percent} por cento, vento ${weather.wind_speed_metres_per_second} metros por segundo, precipitação ${weather.precipitation_millimetres_last_hour} milímetros na última hora`
              : undefined
          }
          style={styles.text}
        >
          {weather ? `${Math.round(weather.temperature_celsius)}°` : ""}
        </Text>
      </BlurPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
  },
  panel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  icon: {
    width: 20,
    height: 20,
  },
  text: {
    color: "#ffffff",
    fontFamily: SYSTEM_FONT,
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    lineHeight: 22,
  },
});
