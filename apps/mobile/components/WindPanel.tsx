import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import {
  BLUR_PANEL_ICON_SIZE,
  BLUR_PANEL_PADDING_VERTICAL,
  BlurPanel,
} from "./BlurPanel";
import { BLUR_TEXT_LINE_HEIGHT, BlurText } from "./BlurText";
import { FADE_OUT_DURATION_MS } from "./use-fade-visibility";
import {
  formatWindLegendLabel,
  METRES_PER_SECOND_TO_KNOTS,
  windLegendBand,
} from "./wind-legend-band";

// Same wind-speed stops/colors as native-wind/cpp/WindShaders.hpp (NRK palette).
const WIND_LEGEND = [
  { label: ">32.6", color: "#310047" },
  { label: "28.5", color: "#4D0A6C" },
  { label: "24.5", color: "#5B278D" },
  { label: "20.8", color: "#7043A8" },
  { label: "17.2", color: "#7B57ED" },
  { label: "13.9", color: "#4B87EA" },
  { label: "10.8", color: "#13A8D6" },
  { label: "8.0", color: "#3CBEBE" },
  { label: "5.5", color: "#79CCAC" },
  { label: "<5.4", color: "#A7CEA1" },
] as const;

const LEGEND_ROW_HEIGHT = BLUR_TEXT_LINE_HEIGHT;
const CLOSED_HEIGHT = 32;
const LEGEND_TOP = CLOSED_HEIGHT;
const EXPANDED_HEIGHT = LEGEND_TOP + WIND_LEGEND.length * LEGEND_ROW_HEIGHT;

export function WindPanel({
  enabled,
  centerWindSpeed,
  currentWindSpeed,
  onToggle,
}: {
  enabled: boolean;
  centerWindSpeed?: number | null;
  currentWindSpeed?: number | null;
  onToggle: () => void;
}) {
  const expansion = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  const selectedBand = enabled ? windLegendBand(centerWindSpeed) : -1;
  const hasCurrentWind =
    typeof currentWindSpeed === "number" &&
    Number.isFinite(currentWindSpeed) &&
    currentWindSpeed >= 0;
  const speedText = hasCurrentWind
    ? `${Math.round(currentWindSpeed * METRES_PER_SECOND_TO_KNOTS * 10) / 10}`
    : "kn";
  const reservedHeader = hasCurrentWind
    ? (
        Math.round(currentWindSpeed * METRES_PER_SECOND_TO_KNOTS * 10) / 10
      ).toString()
    : null;
  const [headerWidth, setHeaderWidth] = useState(0);
  const [legendWidth, setLegendWidth] = useState(0);
  const expandedWidth = Math.max(
    BLUR_PANEL_ICON_SIZE,
    headerWidth,
    legendWidth,
  );

  useEffect(() => {
    expansion.stopAnimation();
    const animation = Animated.timing(expansion, {
      toValue: enabled ? 1 : 0,
      duration: FADE_OUT_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      // Layout animation only on toggles; particle rendering stays fully native.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [enabled, expansion]);

  return (
    <BlurPanel
      flexDirection="column"
      alignSelf="flex-end"
      backgroundOverlay={
        selectedBand >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.selectedBand,
              {
                opacity: expansion,
                top:
                  BLUR_PANEL_PADDING_VERTICAL +
                  LEGEND_TOP +
                  selectedBand * LEGEND_ROW_HEIGHT,
                height:
                  LEGEND_ROW_HEIGHT +
                  (selectedBand === WIND_LEGEND.length - 1
                    ? BLUR_PANEL_PADDING_VERTICAL
                    : 0),
              },
            ]}
          />
        ) : null
      }
    >
      <Animated.View
        style={[
          styles.content,
          {
            width: expansion.interpolate({
              inputRange: [0, 1],
              outputRange: [
                hasCurrentWind ? expandedWidth : BLUR_PANEL_ICON_SIZE,
                expandedWidth,
              ],
            }),
            height: expansion.interpolate({
              inputRange: [0, 1],
              outputRange: [CLOSED_HEIGHT, EXPANDED_HEIGHT],
            }),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={enabled ? "Disable wind" : "Enable wind"}
          accessibilityState={{ expanded: enabled, selected: enabled }}
          onPress={onToggle}
          onLayout={({ nativeEvent }) =>
            setHeaderWidth(nativeEvent.layout.width)
          }
          style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ ios: "wind", android: "air", web: "air" }}
            size={enabled ? 22 : BLUR_PANEL_ICON_SIZE}
            style={{
              width: BLUR_PANEL_ICON_SIZE,
              height: BLUR_PANEL_ICON_SIZE,
            }}
            tintColor="#FFFFFF"
            type="monochrome"
          />
          <Animated.View
            style={[
              styles.headerText,
              { opacity: hasCurrentWind ? 1 : expansion },
            ]}
          >
            <View
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.measurement}
            >
              {reservedHeader !== null ? (
                <BlurText style={styles.speedValue} numberOfLines={1}>
                  {reservedHeader}
                </BlurText>
              ) : null}
              <BlurText style={styles.headerMeasureText} numberOfLines={1}>
                kn
              </BlurText>
            </View>
            {!enabled && hasCurrentWind ? (
              <View
                style={styles.speedReadout}
                accessible
                accessibilityLabel={`Wind: ${speedText} kn`}
              >
                <BlurText style={styles.speedValue} numberOfLines={1}>
                  {speedText}
                </BlurText>
                <BlurText style={styles.speedUnit} numberOfLines={1}>
                  kn
                </BlurText>
              </View>
            ) : (
              <BlurText
                style={[styles.legendText, styles.labelOverlay, styles.headerLabelOverlay]}
                numberOfLines={1}
                accessibilityLabel={"Knots"}
              >
                kn
              </BlurText>
            )}
          </Animated.View>
        </Pressable>
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden={!enabled}
          importantForAccessibility={enabled ? "auto" : "no-hide-descendants"}
          onLayout={({ nativeEvent }) =>
            setLegendWidth(nativeEvent.layout.width)
          }
          style={[styles.legend, { opacity: expansion }]}
        >
          <View style={styles.colorBar} accessible={false}>
            {WIND_LEGEND.map(({ label, color }) => (
              <View
                key={label}
                style={[styles.band, { backgroundColor: color }]}
              />
            ))}
          </View>
          <View>
            {WIND_LEGEND.map(({ label }) => (
              <View key={label} style={styles.legendRow}>
                <BlurText
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.legendText, styles.measurement]}
                  numberOfLines={1}
                >
                  {formatWindLegendLabel(label, "kn")}
                </BlurText>
                <BlurText
                  style={[styles.legendText, styles.labelOverlay]}
                  numberOfLines={1}
                >
                  {formatWindLegendLabel(label, "kn")}
                </BlurText>
              </View>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  headerMeasureText: { fontSize: 12, lineHeight: 14 },
  headerText: { height: CLOSED_HEIGHT, justifyContent: "center" },
  speedReadout: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  speedValue: { fontSize: 16, lineHeight: 22 },
  speedUnit: { fontSize: 10, lineHeight: 10, marginTop: -2 },
  legendText: { fontSize: 12 },
  measurement: { opacity: 0 },
  labelOverlay: { position: "absolute", left: 0, top: 0 },
  headerLabelOverlay: { top: (CLOSED_HEIGHT - BLUR_TEXT_LINE_HEIGHT) / 2 },
  content: { overflow: "hidden" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    height: CLOSED_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  pressed: { opacity: 0.62, transform: [{ scale: 0.94 }] },
  legend: {
    position: "absolute",
    top: LEGEND_TOP,
    left: 0,
    flexDirection: "row",
    gap: 8,
  },
  colorBar: { width: 12, borderRadius: 6, overflow: "hidden" },
  selectedBand: {
    position: "absolute",
    left: 0,
    right: 0,
    height: LEGEND_ROW_HEIGHT,
    backgroundColor: "rgba(0, 0, 0, 0.38)",
  },
  band: { height: LEGEND_ROW_HEIGHT },
  legendRow: { height: LEGEND_ROW_HEIGHT, justifyContent: "center" },
});
