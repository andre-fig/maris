import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SymbolView } from "expo-symbols";
import { Platform } from "react-native";

import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";

export function CompassPanel() {
  return (
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
  );
}
