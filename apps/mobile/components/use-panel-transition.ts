import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

export const PANEL_TRANSITION_DURATION_MS = 280;

/** Shared layout/fade timing. Retarget from the current value on rapid changes. */
export function usePanelTransition(target: number) {
  const value = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    const animation = Animated.timing(value, {
      toValue: target,
      duration: PANEL_TRANSITION_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false, // Also used for width/height, which affect layout.
    });
    animation.start();
    return () => animation.stop();
  }, [target, value]);
  return value;
}
