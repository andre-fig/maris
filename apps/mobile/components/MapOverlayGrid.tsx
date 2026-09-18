import { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

const GRID_COLUMNS = 6;
const GRID_ROWS = 24;

export type MapOverlaySlotProps = PropsWithChildren<{
  column: number;
  row: number;
  columnSpan?: number;
  rowSpan?: number;
  alignItems?: ViewStyle["alignItems"];
  justifyContent?: ViewStyle["justifyContent"];
}>;

export function MapOverlayGrid({ children }: PropsWithChildren) {
  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View pointerEvents="box-none" style={styles.grid}>
        {children}
      </View>
    </View>
  );
}

export function MapOverlaySlot({
  children,
  column,
  row,
  columnSpan = 1,
  rowSpan = 1,
  alignItems = "flex-start",
  justifyContent = "flex-start",
}: MapOverlaySlotProps) {
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.slot,
        {
          left: `${(column / GRID_COLUMNS) * 100}%`,
          top: `${(row / GRID_ROWS) * 100}%`,
          width: `${(columnSpan / GRID_COLUMNS) * 100}%`,
          height: `${(rowSpan / GRID_ROWS) * 100}%`,
          alignItems,
          justifyContent,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    elevation: 10,
  },
  grid: {
    position: "absolute",
    top: 48,
    right: 38,
    bottom: 48,
    left: 38,
  },
  slot: {
    position: "absolute",
  },
});
