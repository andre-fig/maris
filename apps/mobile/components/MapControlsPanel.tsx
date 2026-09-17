import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { BlurPanel } from './BlurPanel';

type MapControlsPanelProps = {
  locationActive: boolean;
  onLocate: () => void;
};

export function MapControlsPanel({
  locationActive,
  onLocate,
}: MapControlsPanelProps) {
  const isAndroid = Platform.OS === 'android';

  return (
    <BlurPanel style={styles.panel}>
      <View style={styles.section}>
        {isAndroid ? (
          <MaterialCommunityIcons
            color="#FFFFFF"
            name="map-outline"
            size={23}
          />
        ) : (
          <SymbolView
            name="map"
            size={23}
            tintColor="#FFFFFF"
            type="monochrome"
          />
        )}
      </View>
      <Pressable
        accessibilityLabel="Centralizar na minha localização"
        accessibilityRole="button"
        onPress={onLocate}
        style={({ pressed }) => [styles.section, pressed && styles.pressed]}
      >
        {isAndroid ? (
          <MaterialCommunityIcons
            color="#FFFFFF"
            name="near-me"
            size={23}
          />
        ) : (
          <SymbolView
            name={locationActive ? 'location.fill' : 'location'}
            size={23}
            tintColor="#FFFFFF"
            type="monochrome"
          />
        )}
      </Pressable>
    </BlurPanel>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 58,
    padding: 6,
    borderRadius: 16,
    rowGap: 6,
  },
  section: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
});
