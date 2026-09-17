import { Marker } from "@maplibre/maplibre-react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolView } from "expo-symbols";
import { Platform, View } from "react-native";

type UserLocationMarkerProps = {
  coordinate: [number, number];
  heading: number | null;
  mapBearing: number;
};

export function UserLocationMarker({
  coordinate,
  heading,
  mapBearing,
}: UserLocationMarkerProps) {
  const rotation = heading === null ? 0 : heading - mapBearing;

  return (
    <Marker id="device-location" lngLat={coordinate} anchor="center">
      <View
        pointerEvents="none"
        style={[{ transform: [{ rotate: `${rotation}deg` }] }]}
      >
        {Platform.OS === "android" ? (
          <MaterialIcons
            color="#0A84FF"
            name="assistant-navigation"
            size={24}
          />
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
