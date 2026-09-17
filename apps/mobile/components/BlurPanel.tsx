import { BlurView } from "expo-blur";
import { PropsWithChildren } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

type BlurPanelProps = PropsWithChildren<{
  flexDirection?: "row" | "column";
}>;

const SYSTEM_FONT = Platform.select({ ios: "System", default: "sans-serif" });

export function BlurPanel({ children, flexDirection }: BlurPanelProps) {
  return (
    <View style={[styles.panel, { flexDirection }]}>
      <BlurView
        intensity={6}
        tint="systemMaterialDark"
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
  },
  panel: {
    borderRadius: 16,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 8,
    columnGap: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 34, 39, 0.18)",
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.32)",
  },
  text: {
    color: "#ffffff",
    fontFamily: SYSTEM_FONT,
    fontSize: 18,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    lineHeight: 22,
  },
  icon: {
    width: 20,
    height: 20,
  },
});
