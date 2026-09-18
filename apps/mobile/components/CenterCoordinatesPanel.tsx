import { StyleSheet } from "react-native";

import { BlurPanel } from "./BlurPanel";
import { BlurText } from "./BlurText";

type CenterCoordinatesPanelProps = {
  longitude: number;
  latitude: number;
};

function formatCoordinate(value: number, positive: string, negative: string) {
  const direction = value < 0 ? negative : positive;
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${degrees}°${minutes.toFixed(3).padStart(6, "0")}′ ${direction}`;
}

export function CenterCoordinatesPanel({
  longitude,
  latitude,
}: CenterCoordinatesPanelProps) {
  const latitudeText = formatCoordinate(latitude, "N", "S");
  const longitudeText = formatCoordinate(longitude, "E", "W");

  return (
    <BlurPanel flexDirection="row" alignSelf="flex-end">
      <BlurText
        accessibilityLabel={`Map center: ${latitudeText}, ${longitudeText}`}
        style={styles.coordinates}
      >
        {latitudeText}   {longitudeText}
      </BlurText>
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  coordinates: {
    fontSize: 18,
    fontWeight: "500",
    lineHeight: 22,
  },
});
