import { BlurView } from "expo-blur";
import { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

type BlurPanelProps = PropsWithChildren<{
  flexDirection?: "row" | "column";
  shape?: "rectangle" | "circle";
}>;

export const BLUR_PANEL_ICON_SIZE = 28;

export function BlurPanel({
  children,
  flexDirection,
  shape = "rectangle",
}: BlurPanelProps) {
  return (
    <View
      style={[
        styles.panel,
        shape === "circle" && styles.circle,
        { flexDirection },
      ]}
    >
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
    alignSelf: "flex-start",
    borderRadius: 16,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 32, 40, 0.24)",
    borderWidth: 0.8,
    borderColor: "rgba(255, 255, 255, 0.32)",
  },
  circle: {
    width: 44,
    height: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 22,
  },
});
