import { BlurView } from "expo-blur";
import { PropsWithChildren } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

type BlurPanelProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

const SYSTEM_FONT = Platform.select({ ios: "System", default: "sans-serif" });

export function BlurPanel({ children, style }: BlurPanelProps) {
  return (
    <View style={[styles.panel, style]}>
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
});
