export class WeatherForecastDto {
  forecast_at!: string;
  temperature_celsius!: number;
  feels_like_celsius!: number;
  condition!: string;
  humidity_percent!: number;
  wind_speed_metres_per_second!: number;
  wind_direction_degrees!: number;
  precipitation_millimetres!: number;
  rain_probability_percent!: number;
  snow_probability_percent!: number;
  icon_code!: string;
  is_day!: boolean;
}

export class CurrentWeatherDto {
  latitude!: number;
  longitude!: number;
  temperature_celsius!: number;
  condition!: string;
  humidity_percent!: number;
  wind_speed_metres_per_second!: number;
  wind_direction_degrees!: number | null;
  precipitation_millimetres_last_hour!: number;
  rain_probability_percent!: number | null;
  rain_probability_at!: string | null;
  icon_code!: string;
  observed_at!: string;
  forecast?: WeatherForecastDto[];
}
