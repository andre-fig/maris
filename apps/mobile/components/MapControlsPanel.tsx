import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { usePanelTransition } from "./use-panel-transition";

import { BLUR_PANEL_GAP, BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";

type MapControlsPanelProps = {
  locationActive: boolean;
  courseUp: boolean;
  onLocate: () => void;
  onMapPress: () => void;
  mapLoading?: boolean;
  showMapButton?: boolean;
};

export function MapControlsPanel({
  locationActive,
  courseUp,
  onLocate,
  onMapPress,
  mapLoading = false,
  showMapButton = true,
}: MapControlsPanelProps) {
  const isAndroid = Platform.OS === "android";
  const reveal = usePanelTransition(showMapButton ? 1 : 0);

  return (
    <BlurPanel alignSelf="flex-end">
      <View style={styles.controls}>
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
      <Animated.View
        pointerEvents={showMapButton ? "auto" : "none"}
        accessibilityElementsHidden={!showMapButton}
        importantForAccessibility={showMapButton ? "auto" : "no-hide-descendants"}
        style={[styles.mapSlot, {
          height: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, BLUR_PANEL_ICON_SIZE + BLUR_PANEL_GAP] }),
          opacity: reveal,
        }]}
      >
      <Pressable
        accessibilityLabel={mapLoading ? "Loading chart information" : "Open map options"}
        accessibilityRole="button"
        accessibilityState={{ busy: mapLoading, disabled: mapLoading || !showMapButton }}
        disabled={mapLoading || !showMapButton}
        onPress={mapLoading || !showMapButton ? undefined : onMapPress}
        style={({ pressed }) => [styles.action, styles.mapAction, pressed && styles.pressed]}
      >
        {mapLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" style={styles.loadingIcon} />
        ) : isAndroid ? (
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
      </Animated.View>
      </View>
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  controls: {
    alignItems: "center",
  },
  mapSlot: {
    width: BLUR_PANEL_ICON_SIZE,
    overflow: "hidden",
  },
  mapAction: {
    paddingTop: BLUR_PANEL_GAP,
    height: BLUR_PANEL_ICON_SIZE + BLUR_PANEL_GAP,
  },
  loadingIcon: {
    width: BLUR_PANEL_ICON_SIZE,
    height: BLUR_PANEL_ICON_SIZE,
  },
  action: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.62,
    transform: [{ scale: 0.92 }],
  },
});
