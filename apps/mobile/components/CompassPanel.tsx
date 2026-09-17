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
  "M18 1 Q18.8 1 19.2 2 L22 10 Q22.4 11 21 11 H15 Q13.6 11 14 10 L16.8 2 Q17.2 1 18 1 Z";
const EAST_TRIANGLE_PATH =
  "M35 18 Q35 18.8 34 19.2 L26 22 Q25 22.4 25 21 V15 Q25 13.6 26 14 L34 16.8 Q35 17.2 35 18 Z";
const SOUTH_TRIANGLE_PATH =
  "M18 35 Q17.2 35 16.8 34 L14 26 Q13.6 25 15 25 H21 Q22.4 25 22 26 L19.2 34 Q18.8 35 18 35 Z";
const WEST_TRIANGLE_PATH =
  "M1 18 Q1 17.2 2 16.8 L10 14 Q11 13.6 11 15 V21 Q11 22.4 10 22 L2 19.2 Q1 18.8 1 18 Z";

const styles = StyleSheet.create({
  compass: {
    width: 36,
    height: 36,
    position: "relative",
  },
});
