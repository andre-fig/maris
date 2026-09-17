import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { BlurPanel } from "./BlurPanel";
import {
  BLUR_TEXT_FONT_SIZE,
  BLUR_TEXT_LINE_HEIGHT,
  BlurText,
} from './BlurText';

function getCardinalDirection(heading: number | null) {
  if (heading === null) return 'N';
  const normalized = ((heading % 360) + 360) % 360;
  if (normalized < 45 || normalized >= 315) return 'N';
  if (normalized < 135) return 'L';
  if (normalized < 225) return 'S';
  return 'O';
}

export function CompassPanel({
  heading,
  mapBearing,
  onPress,
}: {
  heading: number | null;
  mapBearing: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel="Orientar mapa para o norte"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <BlurPanel shape="circle">
        <View
          pointerEvents="none"
          style={[
            styles.compass,
            // The red north triangle follows the map, not the device heading.
            { transform: [{ rotate: `${-mapBearing}deg` }] },
          ]}
        >
          <Svg height="36" width="36" viewBox="0 0 36 36">
            {GRAY_DIRECTIONS.map((rotation) => (
              <Path
                key={rotation}
                d={GRAY_TICK_PATH}
                fill="#8E8E93"
                rotation={rotation}
                origin="18, 18"
              />
            ))}
            <Path d={NORTH_TRIANGLE_PATH} fill="#FF3B30" />
            <Path d={EAST_TRIANGLE_PATH} fill="#FFFFFF" />
            <Path d={SOUTH_TRIANGLE_PATH} fill="#FFFFFF" />
            <Path d={WEST_TRIANGLE_PATH} fill="#FFFFFF" />
          </Svg>
        </View>
        <View pointerEvents="none" style={styles.centerLabel}>
          <BlurText style={styles.directionLabel}>
            {getCardinalDirection(heading)}
          </BlurText>
        </View>
      </BlurPanel>
    </Pressable>
  );
}

const NORTH_TRIANGLE_PATH =
  "M18 1 Q18.3 1 18.4 2 L19.5 5 Q19.7 6 19 6 H17 Q16.3 6 16.5 5 L17.6 2 Q17.7 1 18 1 Z";
const GRAY_TICK_PATH =
  "M18 1 Q18.2 1 18.3 2 L19 5 Q19.1 6 18.5 6 H17.5 Q16.9 6 17 5 L17.7 2 Q17.8 1 18 1 Z";
const GRAY_DIRECTIONS = [
  22.5, 45, 67.5, 112.5, 135, 157.5, 202.5, 225, 247.5, 292.5, 315,
  337.5,
];
const EAST_TRIANGLE_PATH =
  "M35 18 Q35 18.3 34 18.5 L31 19 Q30 19.2 30 18.5 V17.5 Q30 16.8 31 17 L34 17.5 Q35 17.7 35 18 Z";
const SOUTH_TRIANGLE_PATH =
  "M18 35 Q17.6 35 17.5 34 L17 31 Q16.8 30 17.5 30 H18.5 Q19.2 30 19 31 L18.5 34 Q18.4 35 18 35 Z";
const WEST_TRIANGLE_PATH =
  "M1 18 Q1 17.7 2 17.5 L5 17 Q6 16.8 6 17.5 V18.5 Q6 19.2 5 19 L2 18.5 Q1 18.3 1 18 Z";

const styles = StyleSheet.create({
  button: {
    borderRadius: 22,
  },
  pressed: {
    opacity: 0.62,
    transform: [{ scale: 0.94 }],
  },
  compass: {
    width: 36,
    height: 36,
    position: "relative",
  },
  centerLabel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  directionLabel: {
    fontSize: BLUR_TEXT_FONT_SIZE,
    lineHeight: BLUR_TEXT_LINE_HEIGHT,
    fontWeight: "700",
  },
});
