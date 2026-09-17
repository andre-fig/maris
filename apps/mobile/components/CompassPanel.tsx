import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SymbolView } from "expo-symbols";
import { Animated, Platform } from "react-native";

import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";
import { useFadeVisibility } from './use-fade-visibility';

export function CompassPanel({ visible }: { visible: boolean }) {
  const { mounted, opacity } = useFadeVisibility(visible);
  if (!mounted) return null;

  return (
    <Animated.View style={{ opacity }}>
      <BlurPanel shape="circle">
        {Platform.OS === "android" ? (
          <MaterialCommunityIcons
            color="#FFFFFF"
            name="compass-outline"
            size={BLUR_PANEL_ICON_SIZE}
          />
        ) : (
          <SymbolView
            name="safari"
            size={BLUR_PANEL_ICON_SIZE}
            tintColor="#FFFFFF"
            type="monochrome"
          />
        )}
      </BlurPanel>
    </Animated.View>
  );
}
