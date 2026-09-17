import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { BlurPanel } from "./BlurPanel";

export function CompassPanel({ heading }: { heading: number | null }) {
  return (
    <BlurPanel shape="circle">
        <View
          pointerEvents="none"
          style={[
            styles.compass,
            { transform: [{ rotate: `${-(heading ?? 0)}deg` }] },
          ]}
        >
          <Svg height="36" width="36" viewBox="0 0 36 36">
            <Path d={NORTH_TRIANGLE_PATH} fill="#FF3B30" />
            <Path d={EAST_TRIANGLE_PATH} fill="#FFFFFF" />
            <Path d={SOUTH_TRIANGLE_PATH} fill="#FFFFFF" />
            <Path d={WEST_TRIANGLE_PATH} fill="#FFFFFF" />
          </Svg>
        </View>
    </BlurPanel>
  );
}

const NORTH_TRIANGLE_PATH =
  "M18 1 Q18.4 1 18.6 2 L22 5 Q22.2 6 21 6 H15 Q13.8 6 14 5 L17.4 2 Q17.6 1 18 1 Z";
const EAST_TRIANGLE_PATH =
  "M35 18 Q35 18.3 34 18.5 L31 19 Q30 19.2 30 18.5 V17.5 Q30 16.8 31 17 L34 17.5 Q35 17.7 35 18 Z";
const SOUTH_TRIANGLE_PATH =
  "M18 35 Q17.6 35 17.5 34 L17 31 Q16.8 30 17.5 30 H18.5 Q19.2 30 19 31 L18.5 34 Q18.4 35 18 35 Z";
const WEST_TRIANGLE_PATH =
  "M1 18 Q1 17.7 2 17.5 L5 17 Q6 16.8 6 17.5 V18.5 Q6 19.2 5 19 L2 18.5 Q1 18.3 1 18 Z";

const styles = StyleSheet.create({
  compass: {
    width: 36,
    height: 36,
    position: "relative",
  },
});
