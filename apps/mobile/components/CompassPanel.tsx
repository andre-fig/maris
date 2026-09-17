import { StyleSheet, View } from "react-native";

import { BlurPanel } from "./BlurPanel";

export function CompassPanel({ heading }: { heading: number | null }) {
  return (
    <BlurPanel shape="circle">
        <View
          pointerEvents="none"
          style={[
            styles.compass,
            { transform: [{ rotate: `${-(heading ?? 0)}deg` }] },
          ]}
        >
          <View style={[styles.triangle, styles.north]} />
          <View style={[styles.triangle, styles.east]} />
          <View style={[styles.triangle, styles.south]} />
          <View style={[styles.triangle, styles.west]} />
        </View>
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  compass: {
    width: 36,
    height: 36,
    position: "relative",
  },
  triangle: {
    position: "absolute",
    width: 0,
    height: 0,
    borderStyle: "solid",
  },
  north: {
    top: 0,
    left: 14,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FF3B30",
  },
  east: {
    top: 14,
    right: 0,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 8,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#FFFFFF",
  },
  south: {
    bottom: 0,
    left: 14,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
  },
  west: {
    top: 14,
    left: 0,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 8,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "#FFFFFF",
  },
});
