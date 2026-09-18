import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { usePanelTransition } from "./use-panel-transition";

import { BLUR_PANEL_GAP, BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";

type MapControlsPanelProps = {
  locationActive: boolean;
  courseUp: boolean;
  onLocate: () => void;
  onMapPress: () => void;
  onMapModeChange?: (mode: MapMode) => void;
  mapLoading?: boolean;
  showMapButton?: boolean;
};

export type MapMode = "streets" | "satellite" | "three-dimensional";

const MAP_MODES: MapMode[] = ["streets", "satellite", "three-dimensional"];

export function MapControlsPanel({
  locationActive,
  courseUp,
  onLocate,
  onMapPress,
  onMapModeChange,
  mapLoading = false,
  showMapButton = true,
}: MapControlsPanelProps) {
  const isAndroid = Platform.OS === "android";
  const [mapModeIndex, setMapModeIndex] = useState(0);
  const mapMode = MAP_MODES[mapModeIndex];
  const reveal = usePanelTransition(showMapButton ? 1 : 0);
  const globeAccessibilityLabel =
    mapMode === "streets"
      ? "Show satellite map"
      : mapMode === "satellite"
        ? "Show 3D view"
        : "Show street map";

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
              name={
                courseUp
                  ? "navigation"
                  : locationActive
                    ? "near-me"
                    : "navigation-variant-outline"
              }
              size={BLUR_PANEL_ICON_SIZE}
            />
          ) : (
            <SymbolView
              name={
                courseUp
                  ? "location.north.line.fill"
                  : locationActive
                    ? "location.fill"
                    : "location"
              }
              size={BLUR_PANEL_ICON_SIZE}
              tintColor="#FFFFFF"
              type="monochrome"
            />
          )}
        </Pressable>
        <Pressable
          accessibilityLabel={globeAccessibilityLabel}
          accessibilityRole="button"
          onPress={() => {
            const nextIndex = (mapModeIndex + 1) % MAP_MODES.length;
            setMapModeIndex(nextIndex);
            onMapModeChange?.(MAP_MODES[nextIndex]);
          }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          {mapMode === "three-dimensional" && isAndroid ? (
            <MaterialIcons
              color="#FFFFFF"
              name="3d-rotation"
              size={BLUR_PANEL_ICON_SIZE}
            />
          ) : mapMode === "three-dimensional" ? (
            <SymbolView
              name="view.3d"
              size={BLUR_PANEL_ICON_SIZE}
              tintColor="#FFFFFF"
              type="monochrome"
            />
          ) : isAndroid ? (
            <FontAwesome6
              color="#FFFFFF"
              name={mapMode === "satellite" ? "language" : "globe"}
              size={BLUR_PANEL_ICON_SIZE}
            />
          ) : (
            <SymbolView
              name={
                mapMode === "satellite" ? "globe" : "globe.americas.fill"
              }
              size={BLUR_PANEL_ICON_SIZE}
              tintColor="#FFFFFF"
              type="monochrome"
            />
          )}
        </Pressable>
        <Animated.View
          pointerEvents={showMapButton ? "auto" : "none"}
          accessibilityElementsHidden={!showMapButton}
          importantForAccessibility={
            showMapButton ? "auto" : "no-hide-descendants"
          }
          style={[
            styles.mapSlot,
            {
              height: reveal.interpolate({
                inputRange: [0, 1],
                outputRange: [0, BLUR_PANEL_ICON_SIZE + BLUR_PANEL_GAP],
              }),
              opacity: reveal,
            },
          ]}
        >
          <Pressable
            accessibilityLabel={
              mapLoading ? "Loading chart information" : "Open map options"
            }
            accessibilityRole="button"
            accessibilityState={{
              busy: mapLoading,
              disabled: mapLoading || !showMapButton,
            }}
            disabled={mapLoading || !showMapButton}
            onPress={mapLoading || !showMapButton ? undefined : onMapPress}
            style={({ pressed }) => [
              styles.action,
              styles.mapAction,
              pressed && styles.pressed,
            ]}
          >
            {mapLoading ? (
              <ActivityIndicator
                color="#FFFFFF"
                size="small"
                style={styles.loadingIcon}
              />
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
    gap: BLUR_PANEL_GAP,
  },
  mapSlot: {
    width: BLUR_PANEL_ICON_SIZE,
    overflow: "hidden",
    // The slot remains mounted at height zero when the map button is hidden.
    // Cancel the stack gap in that state so no empty space is left below the globe.
    marginTop: -BLUR_PANEL_GAP,
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
