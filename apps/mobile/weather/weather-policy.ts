export const WEATHER_TTL_MS = 10 * 60 * 1_000;
export const WEATHER_RETRY_MS = 30_000;
export const WEATHER_REQUEST_TIMEOUT_MS = 8_000;

export function isWeatherFresh(lastSuccessAt: number, now: number) {
  return lastSuccessAt > 0 && now - lastSuccessAt < WEATHER_TTL_MS;
}
