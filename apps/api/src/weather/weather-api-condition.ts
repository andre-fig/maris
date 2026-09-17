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

export function mapWeatherApiCondition(code: number, isDay: boolean): WeatherIcon {
  switch (code) {
    case 1000: return isDay ? 'CLEAR_DAY' : 'CLEAR_NIGHT';
    case 1003: return isDay ? 'FEW_CLOUDS_DAY' : 'FEW_CLOUDS_NIGHT';
    case 1006: return 'SCATTERED_CLOUDS';
    case 1009: return 'BROKEN_CLOUDS';
    case 1012: case 1015: case 1018: case 1021: case 1024: case 1027:
    case 1030: case 1033: case 1036: case 1039: case 1042: case 1045:
    case 1048: case 1135: case 1147: return 'MIST';
    case 1063: case 1150: case 1153: case 1180: case 1183: case 1240:
      return 'SHOWER_RAIN';
    case 1186: case 1189: case 1192: case 1195: case 1243: case 1246:
      return 'RAIN';
    case 1066: case 1114: case 1117: case 1210: case 1213: case 1216:
    case 1219: case 1222: case 1225: case 1255: case 1258: return 'SNOW';
    case 1069: case 1072: case 1168: case 1171: case 1198: case 1201:
    case 1204: case 1207: case 1237: case 1249: case 1252: case 1261:
    case 1264: return 'MIXED_PRECIP';
    case 1087: case 1273: case 1276: case 1279: case 1282:
      return 'THUNDERSTORM';
    default: return 'BROKEN_CLOUDS';
  }
}
