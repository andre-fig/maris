import { SymbolView } from "expo-symbols";
import { useEffect, useRef } from "react";
import { Animated, StyleProp, StyleSheet, ViewStyle } from "react-native";

import type { CurrentWeather } from "../weather/current-weather";
import {
  getAndroidWeatherSymbol,
  iosWeatherIcons,
  openWeatherIconMap,
} from "../weather/weather-icons";
import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";
import { BlurText } from './BlurText';

type WeatherPanelProps = {
  weather?: CurrentWeather;
  visible: boolean;
  style?: StyleProp<ViewStyle>;
};

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
    <Animated.View style={[{ opacity }, style]}>
      <BlurPanel
        key={displayWeather ? "weather-blur-visible" : "weather-blur-hidden"}
        flexDirection="row"
      >
        {weatherIcon ? (
          <SymbolView
            name={{
              android: getAndroidWeatherSymbol(weatherIcon),
              ios: iosWeatherIcons[weatherIcon],
              web: getAndroidWeatherSymbol(weatherIcon),
            }}
            size={BLUR_PANEL_ICON_SIZE}
            tintColor="#ffffff"
            type="hierarchical"
          />
        ) : null}
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
  wrapper: {
    position: 'absolute',
    alignSelf: 'flex-start',
  },
});
