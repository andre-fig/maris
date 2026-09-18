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
    <BlurPanel flexDirection="row" alignSelf="flex-end" style={styles.panel}>
      <BlurText
        numberOfLines={1}
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
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  panel: {
    maxWidth: "100%",
    paddingHorizontal: 8,
    gap: 4,
  },
});
