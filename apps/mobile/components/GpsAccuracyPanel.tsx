import { StyleSheet, View } from "react-native";

import { BlurPanel } from "./BlurPanel";
import { BlurText } from "./BlurText";
import { GpsAccuracyIndicator } from "./GpsAccuracyIndicator";

type GpsAccuracyPanelProps = {
  accuracy: number | null;
};

export function GpsAccuracyPanel({ accuracy }: GpsAccuracyPanelProps) {
  const value = accuracy === null ? "± —" : `± ${Math.round(accuracy)} m`;

  return (
    <BlurPanel flexDirection="row" alignSelf="stretch" style={styles.panel}>
      <GpsAccuracyIndicator accuracy={accuracy} />
      <BlurText style={styles.label}>GPS</BlurText>
      <View
        accessible
        accessibilityLabel={
          accuracy === null ? "Accuracy unavailable" : `Accuracy ${value}`
        }
      >
        <BlurText style={styles.value}>{value}</BlurText>
      </View>
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 16,
  },
  value: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
  },
  panel: {
    width: "100%",
    paddingHorizontal: 4,
    gap: 4,
  },
});
