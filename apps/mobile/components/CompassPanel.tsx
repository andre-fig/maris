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
  "M35 18 Q35 18.4 34 18.6 L31 20 Q30 20.2 30 19 V17 Q30 15.8 31 16 L34 17.4 Q35 17.6 35 18 Z";
const SOUTH_TRIANGLE_PATH =
  "M18 35 Q17.6 35 17.4 34 L15 31 Q14.8 30 16 30 H20 Q21.2 30 21 31 L18.6 34 Q18.4 35 18 35 Z";
const WEST_TRIANGLE_PATH =
  "M1 18 Q1 17.6 2 17.4 L5 16 Q6 15.8 6 17 V19 Q6 20.2 5 20 L2 18.6 Q1 18.4 1 18 Z";

const styles = StyleSheet.create({
  compass: {
    width: 36,
    height: 36,
    position: "relative",
  },
});
