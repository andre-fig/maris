import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export type WeatherIcon =
  | 'CLEAR_DAY'
  | 'CLEAR_NIGHT'
  | 'FEW_CLOUDS_DAY'
  | 'FEW_CLOUDS_NIGHT'
  | 'SCATTERED_CLOUDS'
  | 'BROKEN_CLOUDS'
  | 'SHOWER_RAIN'
  | 'RAIN'
  | 'THUNDERSTORM'
  | 'SNOW'
  | 'MIST'
  | 'MIXED_PRECIP';

export const openWeatherIconMap: Record<string, WeatherIcon> = {
  '01d': 'CLEAR_DAY',
  '01n': 'CLEAR_NIGHT',
  '02d': 'FEW_CLOUDS_DAY',
  '02n': 'FEW_CLOUDS_NIGHT',
  '03d': 'SCATTERED_CLOUDS',
  '03n': 'SCATTERED_CLOUDS',
  '04d': 'BROKEN_CLOUDS',
  '04n': 'BROKEN_CLOUDS',
  '09d': 'SHOWER_RAIN',
  '09n': 'SHOWER_RAIN',
  '10d': 'RAIN',
  '10n': 'RAIN',
  '11d': 'THUNDERSTORM',
  '11n': 'THUNDERSTORM',
  '13d': 'SNOW',
  '13n': 'SNOW',
  '50d': 'MIST',
  '50n': 'MIST',
  CLEAR_DAY: 'CLEAR_DAY',
  CLEAR_NIGHT: 'CLEAR_NIGHT',
  FEW_CLOUDS_DAY: 'FEW_CLOUDS_DAY',
  FEW_CLOUDS_NIGHT: 'FEW_CLOUDS_NIGHT',
  SCATTERED_CLOUDS: 'SCATTERED_CLOUDS',
  BROKEN_CLOUDS: 'BROKEN_CLOUDS',
  SHOWER_RAIN: 'SHOWER_RAIN',
  RAIN: 'RAIN',
  THUNDERSTORM: 'THUNDERSTORM',
  SNOW: 'SNOW',
  MIST: 'MIST',
  MIXED_PRECIP: 'MIXED_PRECIP',
};

export const iosWeatherIcons: Record<WeatherIcon, SFSymbol> = {
  CLEAR_DAY: 'sun.max',
  CLEAR_NIGHT: 'moon.stars',
  FEW_CLOUDS_DAY: 'cloud.sun',
  FEW_CLOUDS_NIGHT: 'cloud.moon',
  SCATTERED_CLOUDS: 'cloud',
  BROKEN_CLOUDS: 'cloud',
  SHOWER_RAIN: 'cloud.drizzle',
  RAIN: 'cloud.rain',
  THUNDERSTORM: 'cloud.bolt',
  SNOW: 'cloud.snow',
  MIST: 'cloud.fog',
  MIXED_PRECIP: 'cloud.sleet',
};

export const androidWeatherIcons: Record<WeatherIcon, string> = {
  CLEAR_DAY: 'sunny',
  CLEAR_NIGHT: 'clear_night',
  FEW_CLOUDS_DAY: 'partly_cloudy_day',
  FEW_CLOUDS_NIGHT: 'partly_cloudy_night',
  SCATTERED_CLOUDS: 'cloud',
  BROKEN_CLOUDS: 'cloud',
  SHOWER_RAIN: 'rainy',
  RAIN: 'rainy',
  THUNDERSTORM: 'thunderstorm',
  SNOW: 'weather_snowy',
  MIST: 'foggy',
  MIXED_PRECIP: 'weather_mix',
};

export function getAndroidWeatherSymbol(icon: WeatherIcon): AndroidSymbol {
  const symbol = androidWeatherIcons[icon];
  return symbol === 'clear_night' ? 'moon_stars' : (symbol as AndroidSymbol);
}

export function weatherIconFromGfs(
  cloudCover: number | null | undefined,
  precipitationRate: number | null | undefined,
  temperatureKelvin: number | null | undefined,
): WeatherIcon {
  const temperatureCelsius = typeof temperatureKelvin === 'number'
    ? temperatureKelvin - 273.15
    : null;

  if (typeof precipitationRate === 'number' && Number.isFinite(precipitationRate)) {
    if (temperatureCelsius !== null && temperatureCelsius <= 0) return 'SNOW';
    if (precipitationRate >= 0.0001) return 'RAIN';
    if (precipitationRate > 0) return 'SHOWER_RAIN';
  }

  if (typeof cloudCover !== 'number' || !Number.isFinite(cloudCover)) {
    return 'BROKEN_CLOUDS';
  }
  if (cloudCover <= 10) return 'CLEAR_DAY';
  if (cloudCover <= 35) return 'FEW_CLOUDS_DAY';
  if (cloudCover <= 70) return 'SCATTERED_CLOUDS';
  return 'BROKEN_CLOUDS';
}
