import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";

import { BLUR_PANEL_ICON_SIZE } from "./BlurPanel";

export function LoadingIcon({
  children,
  loading,
  size = BLUR_PANEL_ICON_SIZE,
}: PropsWithChildren<{ loading: boolean; size?: number }>) {
  if (!loading) return <>{children}</>;

  return (
    <ActivityIndicator
      color="#FFFFFF"
      size={size}
      style={[styles.indicator, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  indicator: {
    alignItems: "center",
    justifyContent: "center",
  },
});
