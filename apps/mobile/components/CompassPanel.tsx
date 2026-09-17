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
            <Path d={TRIANGLE_PATH} fill="#FF3B30" />
            <Path d={TRIANGLE_PATH} fill="#FFFFFF" rotation={90} origin="18, 18" />
            <Path d={TRIANGLE_PATH} fill="#FFFFFF" rotation={180} origin="18, 18" />
            <Path d={TRIANGLE_PATH} fill="#FFFFFF" rotation={270} origin="18, 18" />
          </Svg>
        </View>
    </BlurPanel>
  );
}

const TRIANGLE_PATH =
  "M18 1 Q18.8 1 19.2 2 L23 10 Q23.5 11 22 11 H14 Q12.5 11 13 10 L16.8 2 Q17.2 1 18 1 Z";

const styles = StyleSheet.create({
  compass: {
    width: 36,
    height: 36,
    position: "relative",
  },
});
