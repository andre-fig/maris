import { SymbolView } from "expo-symbols";
import { StyleSheet, View } from "react-native";

import { BlurPanel } from "./BlurPanel";
import { BlurText } from "./BlurText";

type NavigationDataItem = {
  label: string;
  value: string;
  unit: string;
  iosIcon: string;
  androidIcon: string;
};

const MOCK_NAVIGATION_DATA: NavigationDataItem[] = [
  { label: "SOG", value: "8.4", unit: "kt", iosIcon: "gauge.open.with.lines.needle.33percent", androidIcon: "speed_2" },
  { label: "COG", value: "132°", unit: "", iosIcon: "location.north", androidIcon: "navigation" },
  { label: "Heading", value: "128°", unit: "", iosIcon: "location.north.line", androidIcon: "near_me" },
  { label: "Depth", value: "12.6", unit: "m", iosIcon: "water.waves", androidIcon: "waves" },
  { label: "Draft", value: "1.7", unit: "m", iosIcon: "arrow.down.to.line", androidIcon: "vertical-align-bottom" },
  { label: "UKC", value: "10.9", unit: "m", iosIcon: "arrow.up.and.down", androidIcon: "height" },
];

export function NavigationDataPanel() {
  return (
    <BlurPanel flexDirection="row" alignSelf="stretch" style={styles.panel}>
      {MOCK_NAVIGATION_DATA.map((item, index) => (
        <View
          key={item.label}
          style={[styles.item, index < MOCK_NAVIGATION_DATA.length - 1 && styles.divider]}
        >
          <SymbolView
            name={{ ios: item.iosIcon, android: item.androidIcon, web: item.androidIcon } as never}
            size={22}
            tintColor="#FFFFFF"
            type="hierarchical"
          />
          <BlurText style={styles.label} numberOfLines={1}>{item.label}</BlurText>
          <BlurText style={styles.value} numberOfLines={1}>{item.value}</BlurText>
          <BlurText style={styles.unit}>{item.unit || "\u00A0"}</BlurText>
        </View>
      ))}
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 0,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: 2,
  },
  divider: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.22)",
  },
  label: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 14,
  },
  value: {
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 22,
  },
  unit: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 14,
  },
});
