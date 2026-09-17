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

export const BLUR_TEXT_FONT_FAMILY = Platform.select({
  ios: "System",
  default: "sans-serif",
});
export const BLUR_TEXT_FONT_SIZE = 16;
export const BLUR_TEXT_LINE_HEIGHT = 22;

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
    fontFamily: BLUR_TEXT_FONT_FAMILY,
    fontSize: BLUR_TEXT_FONT_SIZE,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    lineHeight: BLUR_TEXT_LINE_HEIGHT,
  },
});
