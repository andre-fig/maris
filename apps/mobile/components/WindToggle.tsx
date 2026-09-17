import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SymbolView } from "expo-symbols";
import { Platform, Pressable } from "react-native";
import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";

export function WindToggle({ enabled, onPress }: { enabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="Mostrar vento" accessibilityRole="button" onPress={onPress}>
      <BlurPanel>
        {Platform.OS === "android" ? (
          <MaterialCommunityIcons name="weather-windy" size={BLUR_PANEL_ICON_SIZE} color={enabled ? "#BFE7E1" : "#FFFFFF80"} />
        ) : (
          <SymbolView name="wind" size={BLUR_PANEL_ICON_SIZE} tintColor={enabled ? "#BFE7E1" : "#FFFFFF80"} type="monochrome" />
        )}
      </BlurPanel>
    </Pressable>
  );
}
