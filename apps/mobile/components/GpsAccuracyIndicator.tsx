import { StyleSheet, View } from "react-native";

type GpsAccuracyIndicatorProps = {
  accuracy: number | null;
};

type AccuracyLevel = {
  label: "Excellent" | "Good" | "Fair" | "Poor" | "Unavailable";
  bars: number;
  color: string;
};

function getAccuracyLevel(accuracy: number | null): AccuracyLevel {
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy < 0) {
    return { label: "Unavailable", bars: 0, color: "#FFFFFF" };
  }
  if (accuracy <= 5) return { label: "Excellent", bars: 4, color: "#FFFFFF" };
  if (accuracy <= 10) return { label: "Good", bars: 3, color: "#FFFFFF" };
  if (accuracy <= 25) return { label: "Fair", bars: 2, color: "#FFFFFF" };
  return { label: "Poor", bars: 1, color: "#FFFFFF" };
}

export function GpsAccuracyIndicator({ accuracy }: GpsAccuracyIndicatorProps) {
  const level = getAccuracyLevel(accuracy);
  const accuracyText = accuracy === null ? "GPS accuracy unavailable" : `GPS accuracy: ${level.label}, ${Math.round(accuracy)} metres`;

  return (
    <View
      accessible
      accessibilityLabel={accuracyText}
      style={styles.container}
    >
      <View style={styles.bars}>
        {[3, 6, 9, 12].map((height, index) => (
          <View
            key={height}
            style={[
              styles.bar,
              { height },
              index < level.bars ? { backgroundColor: level.color } : styles.inactive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    minWidth: 24,
  },
  bars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 1,
    height: 12,
  },
  bar: {
    borderRadius: 1.5,
      width: 3,
  },
  inactive: {
    backgroundColor: "rgba(105, 117, 124, 0.78)",
  },
});
