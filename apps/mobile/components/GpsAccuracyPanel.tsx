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
    <BlurPanel flexDirection="row" alignSelf="flex-start">
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
    fontSize: 18,
    fontWeight: "400",
    lineHeight: 22,
  },
  value: {
    fontSize: 18,
    fontWeight: "500",
    lineHeight: 22,
  },
});
