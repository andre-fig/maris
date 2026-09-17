import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";

import { BLUR_PANEL_ICON_SIZE, BlurPanel } from "./BlurPanel";
import { BLUR_TEXT_LINE_HEIGHT, BlurText } from "./BlurText";
import { FADE_OUT_DURATION_MS } from "./use-fade-visibility";

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
const LEGEND_TOP = BLUR_PANEL_ICON_SIZE;
const EXPANDED_HEIGHT = LEGEND_TOP + WIND_LEGEND.length * LEGEND_ROW_HEIGHT;

export function WindPanel({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  const expansion = useRef(new Animated.Value(enabled ? 1 : 0)).current;
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
    <BlurPanel flexDirection="column" alignSelf="flex-end">
      <Animated.View
        style={[
          styles.content,
          {
            width: expansion.interpolate({
              inputRange: [0, 1],
              outputRange: [BLUR_PANEL_ICON_SIZE, expandedWidth],
            }),
            height: expansion.interpolate({
              inputRange: [0, 1],
              outputRange: [BLUR_PANEL_ICON_SIZE, EXPANDED_HEIGHT],
            }),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={enabled ? "Desativar vento" : "Ativar vento"}
          accessibilityState={{ expanded: enabled, selected: enabled }}
          onPress={onToggle}
          onLayout={({ nativeEvent }) =>
            setHeaderWidth(nativeEvent.layout.width)
          }
          style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ ios: "wind", android: "air", web: "air" }}
            size={enabled ? 20 : BLUR_PANEL_ICON_SIZE}
            tintColor="#FFFFFF"
            type="monochrome"
          />
          <Animated.View style={{ opacity: expansion }}>
            <BlurText
              style={{ fontSize: 12 }}
              numberOfLines={1}
              accessibilityLabel="Metros por segundo"
            >
              m/s
            </BlurText>
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
                <BlurText style={{ fontSize: 12 }} numberOfLines={1}>
                  {label}
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
  content: { overflow: "hidden" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    height: BLUR_PANEL_ICON_SIZE,
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
  band: { height: LEGEND_ROW_HEIGHT },
  legendRow: { height: LEGEND_ROW_HEIGHT, justifyContent: "center" },
});
