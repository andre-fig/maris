import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SymbolView } from "expo-symbols";
import { Platform, Pressable, StyleSheet } from "react-native";

import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";

type MapControlsPanelProps = {
  locationActive: boolean;
  courseUp: boolean;
  onLocate: () => void;
  onMapPress: () => void;
};

export function MapControlsPanel({
  locationActive,
  courseUp,
  onLocate,
  onMapPress,
}: MapControlsPanelProps) {
  const isAndroid = Platform.OS === "android";

  return (
    <BlurPanel alignSelf="flex-end">
      <Pressable
        accessibilityLabel="Center on my location"
        accessibilityRole="button"
        onPress={onLocate}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        {isAndroid ? (
          <MaterialCommunityIcons
            color="#FFFFFF"
            name={courseUp ? "navigation" : locationActive ? "near-me" : "navigation-variant-outline"}
            size={BLUR_PANEL_ICON_SIZE}
          />
        ) : (
          <SymbolView
            name={courseUp ? "location.north.line.fill" : locationActive ? "location.fill" : "location"}
            size={BLUR_PANEL_ICON_SIZE}
            tintColor="#FFFFFF"
            type="monochrome"
          />
        )}
      </Pressable>
      <Pressable
        accessibilityLabel="Open map options"
        accessibilityRole="button"
        onPress={onMapPress}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        {isAndroid ? (
          <MaterialCommunityIcons
            color="#FFFFFF"
            name="map-outline"
            size={BLUR_PANEL_ICON_SIZE}
          />
        ) : (
          <SymbolView
            name="map"
            size={BLUR_PANEL_ICON_SIZE}
            tintColor="#FFFFFF"
            type="monochrome"
          />
        )}
      </Pressable>
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.62,
    transform: [{ scale: 0.92 }],
  },
});
