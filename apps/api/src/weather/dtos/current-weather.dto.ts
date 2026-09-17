export class CurrentWeatherDto {
  latitude!: number;
  longitude!: number;
  temperature_celsius!: number;
  condition!: string;
  humidity_percent!: number;
  wind_speed_metres_per_second!: number;
  wind_direction_degrees!: number | null;
  precipitation_millimetres_last_hour!: number;
  icon_code!: string;
  observed_at!: string;
}
