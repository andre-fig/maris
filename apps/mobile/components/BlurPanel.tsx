import { BlurView } from "expo-blur";
import { PropsWithChildren, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type BlurPanelProps = PropsWithChildren<{
  flexDirection?: "row" | "column";
  shape?: "rectangle" | "circle";
  alignSelf?: ViewStyle["alignSelf"];
  backgroundOverlay?: ReactNode;
  style?: StyleProp<ViewStyle>;
}>;

export const BLUR_PANEL_ICON_SIZE = 28;
export const BLUR_PANEL_PADDING_VERTICAL = 6;
export const BLUR_PANEL_GAP = 8;

export function BlurPanel({
  children,
  backgroundOverlay,
  flexDirection,
  shape = "rectangle",
  alignSelf = "flex-start",
  style,
}: BlurPanelProps) {
  return (
    <View
      style={[
        styles.panel,
        shape === "circle" && styles.circle,
        style,
        { flexDirection, alignSelf },
      ]}
    >
      <BlurView
        intensity={6}
        tint="systemMaterialDark"
        style={StyleSheet.absoluteFill}
      />
      {backgroundOverlay}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 16,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: BLUR_PANEL_PADDING_VERTICAL,
    gap: BLUR_PANEL_GAP,
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
