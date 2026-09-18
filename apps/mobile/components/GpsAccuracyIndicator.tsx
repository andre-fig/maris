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
    return { label: "Unavailable", bars: 0, color: "#AAB7BF" };
  }
  if (accuracy <= 5) return { label: "Excellent", bars: 4, color: "#74D99A" };
  if (accuracy <= 10) return { label: "Good", bars: 3, color: "#B8D96B" };
  if (accuracy <= 25) return { label: "Fair", bars: 2, color: "#F4C95D" };
  return { label: "Poor", bars: 1, color: "#F18B72" };
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
        {[5, 10, 15, 20].map((height, index) => (
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
    minWidth: 32,
  },
  bars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 2,
    height: 20,
  },
  bar: {
    borderRadius: 1.5,
    width: 4,
  },
  inactive: {
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
});
