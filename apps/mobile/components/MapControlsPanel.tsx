import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SymbolView } from "expo-symbols";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";

type MapControlsPanelProps = {
  locationActive: boolean;
  onLocate: () => void;
};

export function MapControlsPanel({
  locationActive,
  onLocate,
}: MapControlsPanelProps) {
  const isAndroid = Platform.OS === "android";

  return (
    <BlurPanel>
      <View>
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
      </View>
      <Pressable
        accessibilityLabel="Centralizar na minha localização"
        accessibilityRole="button"
        onPress={onLocate}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        {isAndroid ? (
          <MaterialCommunityIcons
            color="#FFFFFF"
            name="near-me"
            size={BLUR_PANEL_ICON_SIZE}
          />
        ) : (
          <SymbolView
            name={locationActive ? "location.fill" : "location"}
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
