import { SymbolView } from "expo-symbols";
import { StyleSheet, View } from "react-native";

import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";
import { BlurText } from "./BlurText";
import { LoadingIcon } from "./LoadingIcon";
import { METRES_PER_SECOND_TO_KNOTS } from "./wind-legend-band";

const PANEL_HEIGHT = 30;
const PANEL_WIDTH = 66;

export function WindPanel({
  enabled,
  loading,
  currentWindSpeed,
}: {
  enabled: boolean;
  loading: boolean;
  currentWindSpeed?: number | null;
}) {
  const hasCurrentWind =
    typeof currentWindSpeed === "number" &&
    Number.isFinite(currentWindSpeed) &&
    currentWindSpeed >= 0;
  const speedText = hasCurrentWind
    ? (currentWindSpeed * METRES_PER_SECOND_TO_KNOTS).toFixed(1)
    : "kt";

  return (
    <BlurPanel flexDirection="row" alignSelf="flex-end" style={styles.panel}>
      <View
        style={styles.content}
        accessible
        accessibilityLabel={
          loading
            ? "Loading wind"
            : hasCurrentWind
              ? `Wind: ${speedText} kt`
              : "Wind"
        }
      >
        <LoadingIcon loading={loading} size={enabled ? 22 : BLUR_PANEL_ICON_SIZE}>
          <SymbolView
            name={{ ios: "wind", android: "air", web: "air" }}
            size={enabled ? 22 : BLUR_PANEL_ICON_SIZE}
            style={styles.icon}
            tintColor="#FFFFFF"
            type="monochrome"
          />
        </LoadingIcon>
        <View style={styles.speedReadout}>
          <BlurText style={styles.speedValue} numberOfLines={1}>
            {speedText}
          </BlurText>
          {hasCurrentWind ? (
            <BlurText style={styles.speedUnit} numberOfLines={1}>
              kt
            </BlurText>
          ) : null}
        </View>
      </View>
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    paddingVertical: 0,
    paddingHorizontal: 6,
  },
  content: {
    width: "100%",
    height: PANEL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  icon: {
    width: BLUR_PANEL_ICON_SIZE,
    height: BLUR_PANEL_ICON_SIZE,
  },
  speedReadout: {
    alignItems: "center",
    justifyContent: "center",
  },
  speedValue: { fontSize: 12, lineHeight: 16 },
  speedUnit: { fontSize: 9, lineHeight: 10, marginTop: -2 },
});
