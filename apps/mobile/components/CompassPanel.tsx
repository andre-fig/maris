import { Animated, StyleSheet, View } from "react-native";

import { BlurPanel } from "./BlurPanel";
import { useFadeVisibility } from './use-fade-visibility';

export function CompassPanel({ visible }: { visible: boolean }) {
  const { mounted, opacity } = useFadeVisibility(visible);
  if (!mounted) return null;

  return (
    <Animated.View style={{ opacity }}>
      <BlurPanel shape="circle">
        <View pointerEvents="none" style={styles.compass}>
          <View style={[styles.triangle, styles.north]} />
          <View style={[styles.triangle, styles.east]} />
          <View style={[styles.triangle, styles.south]} />
          <View style={[styles.triangle, styles.west]} />
        </View>
      </BlurPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  compass: {
    width: 30,
    height: 30,
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
    left: 10,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FF3B30",
  },
  east: {
    top: 10,
    right: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#FFFFFF",
  },
  south: {
    bottom: 0,
    left: 10,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
  },
  west: {
    top: 10,
    left: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderRightWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "#FFFFFF",
  },
});
