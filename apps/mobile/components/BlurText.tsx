import { PropsWithChildren } from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
} from "react-native";

type BlurTextProps = PropsWithChildren<
  TextProps & {
    style?: StyleProp<TextStyle>;
  }
>;

/** Texto padronizado para uso sobre os painéis com blur. */
export function BlurText({ children, style, ...props }: BlurTextProps) {
  return (
    <Text {...props} style={[styles.text, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: "#ffffff",
    fontFamily: Platform.select({ ios: "System", default: "sans-serif" }),
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    lineHeight: 22,
  },
});
