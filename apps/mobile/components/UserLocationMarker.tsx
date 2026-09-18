import { Marker } from "@maplibre/maplibre-react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform, StyleSheet, View } from "react-native";

type UserLocationMarkerProps = {
  coordinate: [number, number];
  heading: number | null;
  mapBearing: number;
  courseUp: boolean;
};

export function UserLocationMarker({
  coordinate,
  heading,
  mapBearing,
  courseUp,
}: UserLocationMarkerProps) {
  // In course-up the camera is already rotating the map to the heading. Keeping
  // the marker fixed avoids briefly applying a new heading against the previous
  // camera bearing while the native map catches up.
  const rotation = courseUp || heading === null ? 0 : heading - mapBearing;

  return (
    <Marker id="device-location" lngLat={coordinate} anchor="center">
      <View
        pointerEvents="none"
        style={[{ transform: [{ rotate: `${rotation}deg` }] }]}
      >
        {Platform.OS === "android" ? (
          <View style={styles.androidMarker}>
            <View style={styles.whiteBacking} />
            <MaterialIcons
              color="#0A84FF"
              name="assistant-navigation"
              size={24}
            />
          </View>
        ) : (
          <SymbolView
            colors={["#FFFFFF", "#0A84FF"]}
            name="location.north.circle.fill"
            size={24}
            type="palette"
            weight="semibold"
          />
        )}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  androidMarker: {
    width: 24,
    height: 24,
  },
  // The arrow is a cutout in this glyph. Back only the inside of its blue
  // circle so the arrow is white without filling the transparent outer corners.
  whiteBacking: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
});
