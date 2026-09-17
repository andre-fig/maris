import { BlurView } from 'expo-blur';
import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type BlurPanelProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function BlurPanel({ children, style }: BlurPanelProps) {
  return (
    <View style={[styles.panel, style]}>
      <BlurView
        intensity={6}
        tint="systemMaterialDark"
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 4,
    backgroundColor: 'rgba(20, 34, 39, 0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    borderRadius: 16,
  },
});
