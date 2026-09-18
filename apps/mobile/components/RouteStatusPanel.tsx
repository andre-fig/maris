import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";

import { BlurPanel } from "./BlurPanel";
import { BlurText } from "./BlurText";

export function RouteStatusPanel() {
  return (
    <BlurPanel flexDirection="column" alignSelf="stretch" style={styles.panel}>
      <View style={styles.routeHeader}>
        <SymbolView
          name="flag"
          size={28}
          tintColor="#FFFFFF"
          type="hierarchical"
        />
        <View style={styles.routeTitle}>
          <BlurText style={styles.title}>Active Route</BlurText>
          <BlurText style={styles.routeName} numberOfLines={1}>
            Ilha da Mãe → Marina da Glória
          </BlurText>
        </View>
        <View style={styles.nextManeuver}>
          <BlurText style={styles.nextManeuverLabel} numberOfLines={1}>
            Next maneuver
          </BlurText>
          <BlurText style={styles.nextManeuverValue} numberOfLines={1}>
            Turn port in 0.8 NM
          </BlurText>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={styles.progressValue} />
      </View>

      <View style={styles.dataRow}>
        <RouteValue label="Next waypoint" value="WP2" />
        <RouteValue label="Distance" value="3.2 NM" />
        <RouteValue label="Bearing" value="214°" />
        <RouteValue label="ETA" value="14:38" />
      </View>

      <View style={styles.divider} />

      <View style={styles.bottomRow}>
        <RouteValue label="Remaining" value="8.4 NM" />
        <RouteValue label="Time remaining" value="1h 12m" />
        <RouteValue label="XTE" value="0.06 NM" />
        <Pressable
          accessibilityLabel="Stop route"
          accessibilityRole="button"
          style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
        >
          <BlurText style={styles.stopLabel}>Stop Route</BlurText>
        </Pressable>
      </View>
    </BlurPanel>
  );
}

function RouteValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.valueCell}>
      <BlurText style={styles.label} numberOfLines={1}>{label}</BlurText>
      <BlurText style={styles.value} numberOfLines={1}>{value}</BlurText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  routeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routeTitle: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
  },
  routeName: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 18,
  },
  nextManeuver: {
    width: 112,
    gap: 1,
  },
  nextManeuverLabel: {
    fontSize: 10,
    fontWeight: "400",
    lineHeight: 13,
  },
  nextManeuverValue: {
    fontSize: 11,
    lineHeight: 14,
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(210, 235, 240, 0.36)",
  },
  progressValue: {
    width: "28%",
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#E8F4F5",
  },
  dataRow: {
    flexDirection: "row",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  valueCell: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.22)",
  },
  label: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  },
  value: {
    fontSize: 15,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  stopButton: {
    width: 86,
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(205, 92, 70, 0.9)",
  },
  stopLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.7,
  },
});
