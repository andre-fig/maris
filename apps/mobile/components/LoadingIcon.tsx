import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";

import { BLUR_PANEL_ICON_SIZE } from "./BlurPanel";

export function LoadingIcon({
  children,
  loading,
}: PropsWithChildren<{ loading: boolean }>) {
  if (!loading) return <>{children}</>;

  return (
    <ActivityIndicator
      color="#FFFFFF"
      size="small"
      style={styles.indicator}
    />
  );
}

const styles = StyleSheet.create({
  indicator: {
    width: BLUR_PANEL_ICON_SIZE,
    height: BLUR_PANEL_ICON_SIZE,
  },
});
